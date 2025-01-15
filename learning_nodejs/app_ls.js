
const fs = require('node:fs/promises');
const path = require('node:path')
const pc = require('picocolors')

const DIRECTORY = process.argv[2] ?? '.';
console.log(DIRECTORY)
console.log(pc.blue("----INICIANDO APP----\n"))


//you recieve a directory path
fs.readdir(DIRECTORY)
    .then(files => {
        files.forEach(file => {
            //file path 
            let PATH = path.resolve(path.join(DIRECTORY,file))

            //getting data of each file
            fs.stat(PATH)
                .then(stats => {
                    let size = stats.size;
                    let type_file = stats.isDirectory() ? 'D':'F';
            
                    console.log(
                        pc.red(file.padEnd(30)),
                        pc.green(' SIZE = '.padStart(4)),
                        pc.green(size.toString().padEnd(7) + ' bytes'),
                        'TYPE_FILE ='.padStart(15),type_file
                    )
                })
            
            
        })

        //console.log(pc.blue("----FINALIZANDO APP----"))
    })
    .catch(error => {
        console.log("ERROR !!!! Directorio no encontrado")
        return
    })

