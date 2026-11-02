import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, VerticalAlign,
  PageOrientation, ImageRun, HeadingLevel
} from 'docx'

// Export DOCX from the Firestore payload. This file never writes to Firebase.
const border = { style: BorderStyle.SINGLE, size: 4, color: '555555' }
const borders = { top: border, bottom: border, left: border, right: border }
const sections = [
  ['STAREA AUTOVEHICULULUI', 'stare', [['data','DATA'],['stare','STAREA AUTOVEHICULULUI'],['semnatura','SEMNĂTURA']]],
  ['ALIMENTĂRI','alimentari',[['data','DATA'],['sediu','SEDIUL SOCIETĂȚII'],['peco','ACREDITATĂ'],['altele','ALTELE'],['semnatura','SEMNĂTURA']]],
  ['ULEI','ulei',[['data','DATA'],['schimb','SCHIMB ULEI'],['completare','COMPLETARE ULEI'],['semnatura','SEMNĂTURA']]],
  ['ADBLUE','adblue',[['data','DATA'],['cantitate','CANTITATEA'],['semnatura','SEMNĂTURA']]],
  ['REVIZII/ITP','revizii',[['data','DATA'],['aspecte','ASPECTE VIZATE'],['semnatura','SEMNĂTURA']]]
]
const travelFields = [
  'data','kmPlecare','locPlecare','localitatePlecare','km1','loc1','localitate1',
  'km2','loc2','localitate2','kmSosire','locSosire','localitateSosire',
  'cuUrban','cuExtra','faraUrban','faraExtra','totalKm','semnatura'
]
// Aceeasi regula de calcul folosita in foaia soferului.
function totalKilometri(row) {
  const chei = ['cuUrban', 'cuExtra', 'faraUrban', 'faraExtra']
  if (chei.every(k => String(row?.[k] ?? '').trim() === '')) return ''
  const valori = chei.map(k => {
    const text = String(row?.[k] ?? '').trim().replace(',', '.')
    if (!text) return 0
    if (!/^\d+(\.\d+)?$/.test(text)) return NaN
    return Number(text)
  })
  if (valori.some(n => !Number.isFinite(n))) return 'Verifica datele'
  return String(Math.round(valori.reduce((a, b) => a + b, 0) * 100) / 100)
}

const para = (text = '', opts = {}) => new Paragraph({
  spacing: { before: 0, after: 0 },
  alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
  children: [new TextRun({text: String(text ?? ''), bold: !!opts.bold, size: opts.size || 13, font: 'Arial'})]
})
function cell(value, opts = {}) {
  let children = [para(value, opts)]
  if (opts.signature && typeof value === 'string' && value.startsWith('data:image/png;base64,')) {
    try {
      const base64 = value.split(',')[1]
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      children = [new Paragraph({alignment: AlignmentType.CENTER, children: [new ImageRun({data: bytes, transformation: {width: 65, height: 23}, type: 'png'})]})]
    } catch { children = [para('[semnătură]', {center: true})] }
  }
  return new TableCell({
    borders, children, verticalAlign: VerticalAlign.CENTER,
    margins: {top: 45, bottom: 45, left: 35, right: 35},
    ...(opts.span ? {columnSpan: opts.span} : {}),
    ...(opts.rowSpan ? {rowSpan: opts.rowSpan} : {}),
  })
}
function smallTable(config, data) {
  const [name, key, fields] = config
  const rows = Array.isArray(data[key]) ? data[key] : []
  return new Table({
    width: {size: 100, type: WidthType.PERCENTAGE},
    rows: [
      new TableRow({children:[cell(name, {span: fields.length, bold: true, center: true})]}),
      new TableRow({children: fields.map(([,label]) => cell(label,{center:true,bold:true,size:11}))}),
      ...Array.from({length: Math.max(3, rows.length)}, (_, index) =>
        new TableRow({children: fields.map(([field]) => cell(rows[index]?.[field] || '', {signature: field === 'semnatura'}))})
      )
    ]
  })
}
function combineTables(configs, data) {
  const prepared = configs.map(([,key,fields]) => ({fields,rows:Array.isArray(data[key]) ? data[key] : []}))
  const maxRows = Math.max(3, ...prepared.map(p => p.rows.length))

  // Prima pereche reproduce exact gruparea "STATIE PECO / ACREDITATA / ALTELE" din model.
  const topModel = configs.length === 2 && configs[0][1] === 'stare' && configs[1][1] === 'alimentari'
  let headerRows

  if (topModel) {
    headerRows = [
      new TableRow({children: [
        cell('STAREA AUTOVEHICULULUI', {span: 3, center:true, bold:true}),
        cell('ALIMENTĂRI', {span: 5, center:true, bold:true})
      ]}),
      new TableRow({children: [
        cell('DATA', {rowSpan:2, center:true, bold:true, size:10}),
        cell('STAREA AUTOVEHICULULUI', {rowSpan:2, center:true, bold:true, size:10}),
        cell('SEMNĂTURA', {rowSpan:2, center:true, bold:true, size:10}),
        cell('DATA', {rowSpan:2, center:true, bold:true, size:10}),
        cell('SEDIUL SOCIETĂȚII', {rowSpan:2, center:true, bold:true, size:10}),
        cell('STAȚIE PECO', {span:2, center:true, bold:true, size:10}),
        cell('SEMNĂTURA', {rowSpan:2, center:true, bold:true, size:10}),
      ]}),
      new TableRow({children: [
        cell('ACREDITATĂ', {center:true, bold:true, size:10}),
        cell('ALTELE', {center:true, bold:true, size:10})
      ]})
    ]
  } else {
    headerRows = [
      new TableRow({children: configs.map((config,index) => cell(config[0],{span:prepared[index].fields.length,center:true,bold:true}))}),
      new TableRow({children: prepared.flatMap(p=>p.fields.map(([,label])=>cell(label,{center:true,bold:true,size:11})))})
    ]
  }

  return new Table({
    width: {size: 100, type: WidthType.PERCENTAGE},
    rows: [
      ...headerRows,
      ...Array.from({length:maxRows},(_,i)=>new TableRow({children:prepared.flatMap(p=>p.fields.map(([field])=>cell(p.rows[i]?.[field] ?? '',{signature:field==='semnatura'})))}))
    ]
  })
}
function journeyTable(rows, header = true) {
  const bodyRows = rows.map(row => new TableRow({
    children: travelFields.map(k => cell(
      k === 'totalKm' ? totalKilometri(row) : (row?.[k] ?? ''),
      {signature: k === 'semnatura'}
    ))
  }))

  const headerRows = header ? [
    new TableRow({ children: [
      ...['DATA', 'KM PLECARE', 'LOCUL PLECĂRII', 'LOCALITATEA'].map(
        label => cell(label, {bold: true, center: true, size: 10, rowSpan: 3})
      ),
      cell('STAȚIA INTERMEDIARĂ', {span: 3, bold: true, center: true, size: 10}),
      cell('STAȚIA INTERMEDIARĂ', {span: 3, bold: true, center: true, size: 10}),
      cell('SOSIRE', {span: 3, bold: true, center: true, size: 10}),
      cell('TOTAL KM EFECTUAȚI', {span: 5, bold: true, center: true, size: 10}),
      cell('SEMNĂTURA', {bold: true, center: true, size: 10, rowSpan: 3})
    ]}),
    new TableRow({ children: [
      ...['KM ÎN BORD', 'LOCUL', 'LOCALITATEA',
        'KM ÎN BORD', 'LOCUL', 'LOCALITATEA',
        'KM ÎN BORD', 'LOCUL', 'LOCALITATEA'].map(
          label => cell(label, {bold: true, center: true, size: 10, rowSpan: 2})
        ),
      cell('CU ÎNCĂRCĂTURĂ', {span: 2, bold: true, center: true, size: 10}),
      cell('FĂRĂ ÎNCĂRCĂTURĂ', {span: 2, bold: true, center: true, size: 10}),
      cell('TOTAL KILOMETRI', {bold: true, center: true, size: 10, rowSpan: 2})
    ]}),
    new TableRow({ children: ['URBAN', 'EXTRAURBAN', 'URBAN', 'EXTRAURBAN'].map(
      label => cell(label, {bold: true, center: true, size: 10})
    )})
  ] : []

  return new Table({
    width: {size: 100, type: WidthType.PERCENTAGE},
    rows: [...headerRows, ...bodyRows]
  })
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(()=>URL.revokeObjectURL(url), 1000)
}
export async function exportFoaieWord(sheet) {
  if (!sheet?.continut) throw new Error('Foaia nu conține date')
  const data = sheet.continut
  const parcurs = Array.isArray(data.parcurs) ? data.parcurs : []
  const doc = new Document({
    sections: [{
      properties: { page: { size: {width: 16838, height: 11906}, orientation: PageOrientation.LANDSCAPE, margin: {top: 450, bottom: 450, left: 350, right: 350} } },
      children: [
        para('FOAIE DE PARCURS',{bold:true,center:true,size:19}),
        para(' '),
        new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[new TableRow({children:[
          cell('SC BELACRIS SRL',{bold:true}),
          cell('NUMĂR ÎNMATRICULARE: ' + (data.numar||'')),
          cell('DATA EMITERII: ' + (data.data||'') + '\nCONDUCĂTOR AUTO: ' + (data.sofer||''))
        ]})]}),
        para(' '),
        combineTables(sections.slice(0,2),data),
        para(' '),
        combineTables(sections.slice(2),data),
        para(' '),
        journeyTable(Array.from({length:6},(_,i)=>parcurs[i]||{})),
        new Paragraph({pageBreakBefore:true,children:[new TextRun({text:'',size:2})]}),
        journeyTable(Array.from({length:Math.max(11,parcurs.length-6)},(_,i)=>parcurs[i+6]||{}),false)
      ]
    }]
  })
  const blob = await Packer.toBlob(doc)
  const clean = String(sheet.ownerName || 'sofer').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_')
  saveBlob(blob, `BELACRIS_Foaie_Parcurs_${clean}_${sheet.luna||'luna'}.docx`)
}
