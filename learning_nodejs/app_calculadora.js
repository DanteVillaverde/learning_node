let x = 15;
let y = 10;
console.log("*******STARTING APP*******")
console.log('x = ',x)
console.log('y = ',y,'\n')

const CALCULADORA = require('./calculadora')
console.log('x+y =',CALCULADORA.sum(x,y));
console.log('x-y =',CALCULADORA.sub(x,y));
console.log('x*y =',CALCULADORA.mul(x,y));
console.log('x/y =',CALCULADORA.div(x,y));