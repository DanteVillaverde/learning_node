const fs = require('node:fs');
const path = require('node:path')

//if you want to get data of current file
//const DIRECTORY_FILE = __dirname;
//const FILEPATH = __filename;

//if you want to get data of any file
const FILEPATH = process.argv[2]

if (!FILEPATH) {
    console.log("NO HAZ INFORMADO RUTA")
    process.exit(1)
}

const FILENAME = path.basename(FILEPATH);
const EXTENSION = path.extname(FILEPATH);

fs.writeFile(
    `${path.basename(FILEPATH,EXTENSION)}_filedata.txt`,
    `
        Archivo : ${FILENAME}
        Directorio : ${FILEPATH.replace("/" + FILENAME,"")}
        Tipo de archivo : ${EXTENSION}
        fecha de ejecucion : ${new Date().toLocaleString()}
    `,
    (error) => {
        if (error) {
            console.log('RUTA INCORRECTA')
        }
    }
)