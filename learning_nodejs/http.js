const http = require("node:http")
const fs = require("node:fs")
const picocolors = require("picocolors");
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
        
        fs.readFile("./html/invoice.html","utf-8",(error, html) => {
            if (error) {
                console.log(picocolors.red("ERROR EN EL DIRECTORIO !!"))
                return;
            }else {
                response.setHeader('Content-type', 'text/html')
                response.end(html)
            }
        })
    }else if (request.url == '/show_invoice') {
        fs.readFile("./html/show_invoice.html", "utf-8",(error,html) =>{
            if (error) {
                console.log(picocolors.red("ERROR EN EL DIRECTORIO !!"))
                return;
            }else {
                response.setHeader('Content-type', 'text/html')
                response.end(html)
            }
        })
    }else{
        response.statusCode = 404;
        response.end(`
            404 : UPS PAGE NOT FOUND
        `)
    }
   
})


server.listen(36394, () =>{
    console.log(`Listen to port 36394`)
    console.log(`URL = http://localhost:36394/`)
})
