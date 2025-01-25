const express = require('express');
const fs = require('node:fs/promises')
const invoices_json = require('./invoices.json')

const app = express();
const PORT = process.env.PORT ?? 36394;
const ERROR_MESSAGE = '<h1>ERROR AL LEER ARCHIVO html</h1>'

//app.use((request, response, next) =>{
//    if (request.method == 'POST') {
//        console.log("middleware =",request.params)
//        let body = '';
//
//        request.on('data', chunk =>{
//            body += chunk;
//        })
//
//        request.on('end', () =>{
//            request.body = body 
//            next()
//        })
//    }else{
//        return next();
//    }
//    
//})

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/invoice',(request, response) => {
    fs.readFile('./html/invoice.html', 'utf-8')
        .then(html => {
            response.send(html)
        })
        .catch(error => {
            response.status(404).send(ERROR_MESSAGE)
        })
})

app.get('/invoice/show_invoices', (request, response) => {
    fs.readFile('./html/show_invoices.html', 'utf-8')
        .then(html => {
            response.send(html)
        })
        .catch(error => {
            response.status(404).send(ERROR_MESSAGE + error)
        })
})

app.get('/invoice/companys', (request, response) => {
    fs.readFile('./html/companys.html', 'utf-8')
        .then(html => {
            response.send(html)
        })
        .catch(error => {
            response.status(404).send(ERROR_MESSAGE + error)
        })
})

app.post('/invoice',(request, response) => {
    console.log(request.body)
})

app.listen(PORT, ()=> {
    console.log(`LISTENING ON PORT http://localhost:${PORT}`)
})