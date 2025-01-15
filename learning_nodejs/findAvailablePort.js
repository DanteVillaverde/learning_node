const net = require('node:net')

function findAvailablePort(desiredPort) {
    return new Promise((resolve, reject)=>{
        const server = net.createServer();

        server.listen(desiredPort, () => {
            const PORT = server.address().port;

            server.close(() => {
                resolve(PORT)
            })
        })

        server.on('error', error => {
            if (error) {
                findAvailablePort(0).then(port => resolve(port))
            }
            else{
                reject(error)
            }
        })
    })
}

module.exports = {findAvailablePort}