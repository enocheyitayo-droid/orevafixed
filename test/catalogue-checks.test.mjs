import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogueWarnings} from '../public/catalogue-checks.js';
test('owner sees catalogue problems without silently altering price or stock',()=>{
 const p={name:'Shoe',category:'Bags',variants:[{price:1500,colour:'Black and white',size:'',stock:2}]};const before=JSON.stringify(p);assert.equal(catalogueWarnings(p).length,3);assert.equal(JSON.stringify(p),before);
 assert.equal(catalogueWarnings({name:'Heels',category:'Shoes',variants:[{price:2200000,colour:'Black',size:'37- 42'}]}).length,1);
 assert.deepEqual(catalogueWarnings({name:'Heels',category:'Shoes',variants:[{price:2200000,colour:'Black',size:'38'}]}),[]);
});
