const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let summary='';const values={nombres:'Prueba',apellidos:'Formulario',rnc:'123456789',rutaCobro:'Zona A',vivienda:'Alquiler',dependientes:'2',latitud:'0',longitud:'-70.09',firmaBase64:'FIRMA_DE_PRUEBA',firmaNombre:'firma-cliente.png',firmaTipo:'image/png'};
const form={elements:Object.fromEntries(Object.keys(values).map(k=>[k,{type:k==='firmaBase64'?'hidden':'text'}]))};
const document={documentElement:{dataset:{}},getElementById(){return {setAttribute(){},addEventListener(){},querySelectorAll(){return []}};},querySelector:s=>s==='#updateForm'?form:s==='#summaryBox'?{set innerHTML(v){summary=v;}}:null,addEventListener(){},createElement(){return {set textContent(v){this.value=v;},get innerHTML(){return String(this.value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}};}};
class FormDataMock { *entries(){yield*Object.entries(values);} get(k){return values[k]??null;} }
const context={document,URLSearchParams,FormData:FormDataMock,window:{},fetch(){throw Error('No enviar datos durante pruebas');}};
vm.createContext(context);
let source=fs.readFileSync(require('node:path').join(__dirname,'../script.js'),'utf8').replace("document.addEventListener('DOMContentLoaded', init);","globalThis.testApi={validateField,convertirFormularioAParametros,renderSummary};");
source=source.slice(source.indexOf('/* =========================================================================='));vm.runInContext(source,context);
const input=(value,required=false,native=true)=>({value,required,type:'text',id:'',closest(){return null;},checkValidity(){return native;}});
assert.equal(context.testApi.validateField(input('')),true,'Opcional vacío permitido');
assert.equal(context.testApi.validateField(input('',true)),false,'Obligatorio vacío rechazado');
assert.equal(context.testApi.validateField(input('-2',false,false)),false,'Número fuera de rango rechazado');
const rnc=input('123');rnc.id='rnc';assert.equal(context.testApi.validateField(rnc),false);
rnc.value='123456789';assert.equal(context.testApi.validateField(rnc),true);
(async()=>{const params=await context.testApi.convertirFormularioAParametros();for(const k of Object.keys(values))assert.equal(params.get(k),values[k],k);context.testApi.renderSummary();assert(summary.includes('Zona A'));assert(summary.includes('Agregada'));assert(!summary.includes('FIRMA_DE_PRUEBA'));console.log('Validación, envío de campos y firma, resumen: correctos. Sin solicitudes externas.');})();
