const express = require('express');
const fs = require('node:fs/promises')
const invoices_json = require('./invoices.json')

const app = express();
const PORT = process.env.PORT ?? 36394;
const ERROR_MESSAGE = '<h1>ERROR AL LEER ARCHIVO html</h1>'

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/invoice',(request, response) => {
    fs.readFile('learning_nodejs/html/register_invoice.html', 'utf-8')
        .then(html => {
            response.send(html)
        })
        .catch(error => {
            response.status(404).send(ERROR_MESSAGE+ error)
        })
})

app.get('/invoice/show_invoices', (request, response) => {
    fs.readFile('learning_nodejs/html/show_invoices.html', 'utf-8')
        .then(html => {
            response.send(html)
        })
        .catch(error => {
            response.status(404).send(ERROR_MESSAGE + error)
        })
})

app.get('/invoice/companys', (request, response) => {
    fs.readFile('learning_nodejs/html/companys.html', 'utf-8')
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