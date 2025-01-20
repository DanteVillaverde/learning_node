const http = require("node:http")
const fs = require("node:fs")
const desiredPort = process.argv[2] ?? 0;

const server = http.createServer((request, response) => {
    switch (request.method) {
        case 'GET':
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

            break;

        case 'POST':
            if (request.url == '/post') {
                let body = '';

                request.on('data', chunk => {
                    body = body + chunk.toString()
                })

                request.on('end', () => {
                    const data = JSON.parse(body)
                    console.log('body =', body, '\ntypeof =', typeof body)
                    console.log('data =', data, '\ntypeof =', typeof data)

                    response.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' })
                    response.end(JSON.stringify(data))
                })
            }
            break;
    
        default:
            break;
    } 
    
    
   
})


server.listen(36394, () =>{
    console.log(`Listen to port 36394`)
    console.log(`URL = http://localhost:36394/`)
})
