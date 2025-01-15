const http = require("node:http")
const { findAvailablePort }= require("./findAvailablePort.js")
const desiredPort = process.argv[2] ?? 0;





const server = http.createServer((request, response) => {
    

    if (request.url == '/') {
        response.statusCode = 200;
        response.setHeader('Content-type', 'text/html')
        response.end(`
            <h1> PAGINA WEB FACTURAS ELECTRONICAS</h1>
        `)
    }else if (request.url == '/invoice') {
        response.statusCode = 200;
        response.setHeader('Content-type', 'text/plain');
        response.end(`
            CONTROL AUTOMATICO MODERNO:
            EL CONTROL ES EL ESTUDIO DE LA AUTOMATIZACION INDUSTRIAL
        
        `)
    }else{
        response.statusCode = 404;
        response.end(`
            404 : UPS PAGE NOT FOUND
        `)
    }
   
})

findAvailablePort(36394)
    .then(port =>{
        server.listen(port, () =>{
            console.log(`Listen to port ${port}`)
            console.log(`URL = http://localhost:${port}/`)
        })
    })

