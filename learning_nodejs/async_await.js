const { error } = require('node:console');
const fs = require('node:fs/promises')
const path = require('node:path')

async function readfiles() {
    /**
     * CALLBACK
     */
    //fs.readFile('./filesystem_filedata.txt','utf-8',
    //    (error, file)=>{
    //        if (error) console.log("error al leer archivo")
    //        
    //        console.log("Archivo 1","\n",file)
    //
    //    }
    //)

    //fs.readFile('./get_fyle_filedata.txt', 'utf-8',
    //    (error,file) => {
    //        if (error) console.log("error al leer archivo")
    //        
    //        console.log("Archivo 2","\n",file)
    //    }
    //)

    //fs.readFile('./calculadora_filedata.txt', 'utf-8',
    //    (error,file) => {
    //        if (error) console.log("error al leer archivo")
    //        
    //        console.log("Archivo 3","\n",file)
    //    }
    //)

    /**
     * PROMISES
     */
    //fs.readFile('./gcom_rebcont_filedata.txt','utf-8')
    //    .then(file => {
    //        console.log("Archivo","\n",file)
//
    //        //second file
    //        return fs.readFile('./get_fyle_filedata.txt','utf-8')
    //    })
    //    .then(file2 =>{
    //        console.log("Archivo2","\n",file2)
//
    //        //third file
    //        return fs.readFile('./calculadora_filedata.txt','utf-8')
    //    })
    //    .then(file3 => {
    //        console.log("Archivo3","\n",file3)
    //    })
    //    .catch(error => {
    //        console.log("error al leer archivo")
    //    })


    /**
     * ASYNC AWAIT
     */
    try {
        const file1 = await fs.readFile('./get_fyle_filedata.txt', 'utf-8') //returns a promise
        console.log('archivo 1: ', file1)

        const file2 = await fs.readFile('./gcom_rebcont_filedata.txt', 'utf-8') //returns a promise
        console.log('archivo 2: ', file2)

        const file3 = await fs.readFile('./ddcalculadora_filedata.txt', 'utf-8') //returns a promise
        console.log('archivo 3: ', file3)
    } catch (error) {
        console.log("ERROR EN LOS DIRECTORIOS")
    }
    

}



readfiles();
