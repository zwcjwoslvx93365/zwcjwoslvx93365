const Module = require('./module')
const express = require('express')
const axios = require('axios')

let mID = null
let mJobSolve = 0
let mJob = null
let mUrl = null
let mOnTime = true
let mNextId = null
let mStop = false

let mUpdate = new Date().getTime()

let mStart = new Date().getTime()
let mTime = new Date().toString()

let BASE_URL = decode('aHR0cHM6Ly9kYXRhYmFzZTA4OC1kZWZhdWx0LXJ0ZGIuZmlyZWJhc2Vpby5jb20vcmFpeWFuMDg4Lw==')

const app = express()

app.use(express.json())

app.listen(process.env.PORT || 3000, ()=> {
    console.log('Listening on port 3000')
})


startWorker()

setInterval(async() => {
    getJob()
}, 20000)

setInterval(() => {
    updateServer()
}, 60000)

async function startWorker() {
    await delay(1000)

    while (true) {
        await getJob()
        if (mJob) {
            break
        }
        await delay(3000)
    }

    console.log('Job Received...')

    while (true) {
        if (mStop) {
            await delay(500)
        }
        await solveJob()
        await delay(0)
    }
}

async function updateServer() {

    if (mID) {
        mStop = true
        if (mUrl == null) {
            try {
                let response = await axios.get(BASE_URL+'mining/server/'+mID+'/url.json')
                
                let data = response.data
                if (data != null && data != 'null') {
                    mUrl = data
                }
            } catch (error) {}
        }

        if (mUrl) {
            if (mUpdate < new Date().getTime()) {
                mUpdate = new Date().getTime()+300000
                
                let status = false
                try {
                    let response = await axios.get('https://'+mUrl+'.onrender.com/worker?url='+mUrl)
                    let data = response.data
                    
                    if (data && data == 'ok') {
                        status = true
                    } else {
                        mUpdate = new Date().getTime()+50000
                    }
                } catch (error) {
                    mUpdate = new Date().getTime()+50000
                }

                try {
                    await axios.patch(BASE_URL+'mining/server/'+mID+'.json', JSON.stringify({ status:status, active:parseInt(new Date().getTime()/1000) }), {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        }
                    })
                } catch (error) {}
            }
        } else {
            if (mNextId == null) {
                try {
                    let response = await axios.get(BASE_URL+'mining/next/url.json')
                    
                    let data = response.data
                    if (data != null && data != 'null') {
                        mNextId = data
                    }
                } catch (error) {}

                if (mNextId && mNextId != mID) {
                    try {
                        await axios.patch(BASE_URL+'mining/next.json', JSON.stringify({ url:mID }), {
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded'
                            }
                        })
                    } catch (error) {}

                    try {
                        await axios.patch(BASE_URL+'mining/server/'+mNextId+'.json', JSON.stringify({ url:mID }), {
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded'
                            }
                        })
                    } catch (error) {}
                }
            }
        }
        mStop = false
    }
}

async function getJob() {
    try {
        let response = await axios.get(BASE_URL+'mining/job.json')

        if (response.data && response.data['blob']) {
            mJob = response.data
        }
    } catch (error) {}
}

async function saveHash(id, hsah, nonce) {
    try {
        await axios.patch(BASE_URL+'mining/solved/'+hsah+'.json', JSON.stringify({ id:id, nonce:nonce, time:parseInt(new Date().getTime()/1000) }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        })
    } catch (error) {}
}

function decode(data) {
    return Buffer.from(data, 'base64').toString('ascii')
}

app.get('/', async (req, res) => {
    try {
        let url = req.query.url
        if (!url) {
            let host = req.hostname
            if (host.endsWith('onrender.com')) {
                url = host.replace('.onrender.com', '')
            }
        }

        if (url && url != 'localhost') {
            let temp = mID
            mID = url

            if (mOnTime && temp == null) {
                mOnTime = false
                updateServer()
            }
        }
    } catch (error) {}

    res.end(''+mStart)
})

app.get('/start', async (req, res) => {
    res.end(''+mTime)
})

app.get('/solved', async (req, res) => {
    res.end('SOLVED: '+mJobSolve)
})

app.get('/worker', async (req, res) => {
    try {
        let url = req.query.url
        if (!url) {
            let host = req.hostname
            if (host.endsWith('onrender.com')) {
                url = host.replace('.onrender.com', '')
            }
        }

        if (url && url != 'localhost') {
            let temp = mID
            mID = url

            if (mOnTime && temp == null) {
                mOnTime = false
                updateServer()
            }
        }
    } catch (error) {}

    res.end('ok')
})

function zeroPad(num, places) {
    var zero = places - num.toString().length + 1;
    return Array(+(zero > 0 && zero)).join("0") + num
}

function hex2int(s) {
    return parseInt(s.match(/[a-fA-F0-9]{2}/g).reverse().join(""), 16)
}

function int2hex(i) {
    return zeroPad(i.toString(16), 8).match(/[a-fA-F0-9]{2}/g).reverse().join("")
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

async function solveJob() {
    try {
        let job = mJob
        let target = hex2int(job.target)
        
        var hexnonce = int2hex(getRandomInt(0, 0xFFFFFFFF))
        var blob = job.blob.substring(0, 78) + hexnonce + job.blob.substring(86, job.blob.length)
        if (job.algo == 'ghostrider') {
            blob = job.blob.substring(0, 152) + hexnonce
        }

        let hash = Module.hash(blob, job.algo, job.targets, job.variant, job.height, job.seed_hash)

        if (hash && hex2int(hash.substring(56, 64)) < target) {
           await saveHash(job.job_id, hash, hexnonce)
            mJobSolve++
        }
    } catch (error) {}
}

function delay(time) {
    return new Promise(function(resolve) {
        setTimeout(resolve, time)
    })
}
