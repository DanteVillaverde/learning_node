const express = require('express');
const fs = require('node:fs/promises')
const app = express();
const PORT = 36394;
const ERROR_MESSAGE = '<h1>ERROR AL LEER ARCHIVO</h1>'

app.use((request, response, next) =>{
    if (request.method == 'POST') {
        let body = '';

        request.on('data', chunk =>{
            body += chunk;
        })

        request.on('end', () =>{
            request.body = body 
            next()
        })
    }else{
        return next();
    }
    
})

app.get('/',(request, response) => {
    fs.readFile('./html/welcome.html')
        .then(html => {
            response.statusCode = 200;
            response.setHeader('Content-type','text/html')
            response.send(html)
        })
        .catch(error => {
            response.statusCode = 404;
            response.setHeader('Content-type','text/html')
            response.send(ERROR_MESSAGE)
        })
})

app.get('/invoice',(request, response) => {
    fs.readFile('./html/invoice.html')
        .then(html => {
            response.statusCode = 200;
            response.setHeader('Content-type','text/html')
            response.send(html)
        })
        .catch(error => {
            response.statusCode = 404;
            response.setHeader('Content-type','text/html')
            response.send(ERROR_MESSAGE)
        })
})

app.get('/show_invoice',(request, response) => {
    fs.readFile('./html/show_invoice.html')
        .then(html => {
            response.statusCode = 200;
            response.setHeader('Content-type','text/html')
            response.send(html)
        })
        .catch(error => {
            response.statusCode = 404;
            response.setHeader('Content-type','text/html')
            response.send(ERROR_MESSAGE)
        })
})

app.post('/post', (request, response) => {
    response.status(200).send(request.body)
})

app.listen(PORT, ()=> {
    console.log(`LISTENING ON PORT http://localhost:${PORT}`)
})