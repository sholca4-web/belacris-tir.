import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from './firebase'
import './Soferi.css'
import './FoaieModel.css'
import { exportFoaieWord } from './ExportWord'

const EMPTY = '—'

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

const groups = [
  ['STAREA AUTOVEHICULULUI', 'stare', [['data', 'DATA'], ['stare', 'STAREA AUTOVEHICULULUI'], ['semnatura', 'SEMNĂTURA']]],
  ['ALIMENTĂRI', 'alimentari', [['data', 'DATA'], ['sediu', 'SEDIUL SOCIETĂȚII'], ['peco', 'ACREDITATĂ'], ['altele', 'ALTELE'], ['semnatura', 'SEMNĂTURA']]],
  ['ULEI', 'ulei', [['data', 'DATA'], ['schimb', 'SCHIMB ULEI'], ['completare', 'COMPLETARE ULEI'], ['semnatura', 'SEMNĂTURA']]],
  ['ADBLUE', 'adblue', [['data', 'DATA'], ['cantitate', 'CANTITATEA'], ['semnatura', 'SEMNĂTURA']]],
  ['REVIZII/ITP', 'revizii', [['data', 'DATA'], ['aspecte', 'ASPECTE VIZATE'], ['semnatura', 'SEMNĂTURA']]],
]
const journey = [
  ['data', 'DATA'], ['kmPlecare', 'KM PLECARE'], ['locPlecare', 'LOCUL PLECĂRII'], ['localitatePlecare', 'LOCALITATEA'],
  ['km1', 'KM ÎN BORD'], ['loc1', 'LOCUL'], ['localitate1', 'LOCALITATEA'],
  ['km2', 'KM ÎN BORD'], ['loc2', 'LOCUL'], ['localitate2', 'LOCALITATEA'],
  ['kmSosire', 'KM ÎN BORD'], ['locSosire', 'LOCUL'], ['localitateSosire', 'LOCALITATEA'],
  ['cuUrban', 'URBAN'], ['cuExtra', 'EXTRAURBAN'], ['faraUrban', 'URBAN'], ['faraExtra', 'EXTRAURBAN'],
  ['totalKm', 'TOTAL KILOMETRI'], ['semnatura', 'SEMNĂTURA'],
]

function DisplayCell({ value, signature = false }) {
  if (signature && typeof value === 'string' && /^data:image\/png;base64,/.test(value)) {
    return <img className="beacris-sign" src={value} alt="Semnătura șoferului" />
  }
  return <span>{typeof value === 'string' || typeof value === 'number' ? value : ''}</span>
}
function SmallTable({ group }) {
  const [title, key, fields] = group
  const rows = group.data?.[key] || []
  return <table className="beacris-document-table belacris-model-small">
    <thead>
      <tr><th colSpan={fields.length}>{title}</th></tr>
      {key === 'alimentari' ? <>
        <tr>
          <th rowSpan={2}>DATA</th>
          <th rowSpan={2}>SEDIUL SOCIETĂȚII</th>
          <th colSpan={2}>STAȚIE PECO</th>
          <th rowSpan={2}>SEMNĂTURĂ</th>
        </tr>
        <tr><th>ACREDITATĂ</th><th>ALTELE</th></tr>
      </> : (
        <tr>{fields.map(([id, label]) => <th key={id}>{label}</th>)}</tr>
      )}
    </thead>
    <tbody>{Array.from({length: Math.max(3, rows.length)}, (_, i) => <tr key={i}>
      {fields.map(([field]) => <td key={field}><DisplayCell value={rows[i]?.[field]} signature={field === 'semnatura'} /></td>)}
    </tr>)}</tbody>
  </table>
}
function JourneyTable({ rows, firstPage = false }) {
  return <table className="beacris-document-table beacris-journey belacris-model-journey">
    {firstPage && <thead>
      <tr>
        {journey.slice(0, 4).map(([id, label]) => <th key={id} rowSpan={3}>{label}</th>)}
        <th colSpan={3}>STAȚIA INTERMEDIARĂ</th>
        <th colSpan={3}>STAȚIA INTERMEDIARĂ</th>
        <th colSpan={3}>SOSIRE</th>
        <th colSpan={5}>TOTAL KM EFECTUAȚI</th>
        <th rowSpan={3}>SEMNĂTURA</th>
      </tr>
      <tr>
        {journey.slice(4, 13).map(([id, label]) => <th key={id} rowSpan={2}>{label}</th>)}
        <th colSpan={2}>CU ÎNCĂRCĂTURĂ</th>
        <th colSpan={2}>FĂRĂ ÎNCĂRCĂTURĂ</th>
        <th rowSpan={2}>TOTAL KILOMETRI</th>
      </tr>
      <tr><th>URBAN</th><th>EXTRAURBAN</th><th>URBAN</th><th>EXTRAURBAN</th></tr>
    </thead>}
    <tbody>{rows.map((row, i) => <tr key={i}>
      {journey.map(([id]) => <td key={id}>
        {id === 'totalKm'
          ? <DisplayCell value={totalKilometri(row)} />
          : <DisplayCell value={row?.[id]} signature={id === 'semnatura'} />}
      </td>)}
    </tr>)}</tbody>
  </table>
}

function FoaieCompleta({ sheet }) {
  const data = sheet.continut || {}
  const rows = Array.isArray(data.parcurs) ? data.parcurs : []
  const sections = groups.map(group => Object.assign([...group], {data}))
  return <div className="beacris-pages-scroll">
    <article className="beacris-document-page">
      <h3>FOAIE DE PARCURS</h3>
      <div className="beacris-document-meta">
        <strong>SC BELACRIS SRL</strong>
        <div><strong>NUMĂR ÎNMATRICULARE:</strong> {data.numar || ''}</div>
        <div><strong>DATA EMITERII:</strong> {data.data || ''}<br/><strong>CONDUCĂTOR AUTO:</strong> {data.sofer || ''}</div>
      </div>
      <div className="beacris-document-pair">{sections.slice(0, 2).map(g => <SmallTable key={g[1]} group={g} />)}</div>
      <div className="beacris-document-triple">{sections.slice(2).map(g => <SmallTable key={g[1]} group={g} />)}</div>
      <JourneyTable firstPage rows={Array.from({length: 6}, (_,i) => rows[i] || {})} />
    </article>
    <article className="beacris-document-page beacris-document-page2" aria-label="Continuare foaie de parcurs — pagina 2">
      <JourneyTable rows={Array.from({length: Math.max(11, rows.length - 6)}, (_,i) => rows[i + 6] || {})} />
    </article>
  </div>
}

export default function Soferi() {
  const [users, setUsers] = useState([])
  const [foi, setFoi] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  async function downloadWord(sheet) {
    if (exporting) return
    setExportError('')
    setExporting(true)
    try { await exportFoaieWord(sheet) }
    catch (error) { console.error(error); setExportError('Exportul Word a eșuat: ' + error.message) }
    finally { setExporting(false) }
  }
  const [errors, setErrors] = useState({})
  const [loaded, setLoaded] = useState({users: false, foi: false})
  useEffect(() => {
    const stopUsers = onSnapshot(collection(db, 'users'), snap => {
      setUsers(snap.docs.map(d => ({id: d.id, ...d.data()})))
      setLoaded(s => ({...s, users: true}))
      setErrors(e => ({...e, users: ''}))
    }, err => { setErrors(e => ({...e, users: err.code})); setLoaded(s => ({...s, users: true})) })
    const stopFoi = onSnapshot(collection(db, 'foiParcurs'), snap => {
      setFoi(snap.docs.map(d => ({id: d.id, ...d.data()})))
      setLoaded(s => ({...s, foi: true}))
      setErrors(e => ({...e, foi: ''}))
    }, err => { setErrors(e => ({...e, foi: err.code})); setLoaded(s => ({...s, foi: true})) })
    return () => { stopUsers(); stopFoi() }
  }, [])
  const selected = foi.find(f => f.id === selectedId)
  return <main className="beacris-admin">
    <h2>Panou administrator BELACRIS</h2>
    <h3>Utilizatori ({users.length})</h3>
    {errors.users && <p role="alert">Eroare utilizatori: {errors.users}</p>}
    {!loaded.users && <p>Se încarcă utilizatorii...</p>}
    <div className="beacris-admin-tablewrap"><table className="beacris-admin-table">
      <thead><tr><th>Nume</th><th>Rol</th><th>Stare</th></tr></thead>
      <tbody>{users.map(u => <tr key={u.id}><td>{u.name || EMPTY}</td><td>{u.role || EMPTY}</td><td>{u.active ? 'Activ' : 'Inactiv'}</td></tr>)}</tbody>
    </table></div>
    <h3>Foi de parcurs sincronizate ({foi.length})</h3>
    {errors.foi && <p role="alert">Eroare foi: {errors.foi}</p>}
    {!loaded.foi && <p>Se încarcă foile...</p>}
    <div className="beacris-admin-tablewrap"><table className="beacris-admin-table">
      <thead><tr><th>Șofer</th><th>Luna</th><th>Camion</th><th>Acțiune</th></tr></thead>
      <tbody>{foi.map(f => <tr key={f.id}>
        <td>{f.ownerName || EMPTY}</td><td>{f.luna || EMPTY}</td><td>{f.numar || EMPTY}</td>
        <td><button onClick={() => setSelectedId(f.id)}>Verifică foaia</button></td>
      </tr>)}</tbody>
    </table></div>
    {selected && <section className="beacris-admin-preview">
      <div className="beacris-admin-preview-head"><div><h3>{selected.ownerName || 'Șofer'} — {selected.luna || ''}</h3><p>Vizualizare completă, numai pentru citire. Exportul Word este o versiune de test.</p></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button disabled={exporting} onClick={() => downloadWord(selected)}>{exporting ? 'Se pregătește...' : 'Descarcă Word'}</button><button onClick={() => setSelectedId(null)}>Închide</button></div></div>
      {exportError && <p role="alert" style={{color:'#b91c1c'}}>{exportError}</p>}
      <FoaieCompleta sheet={selected} />
    </section>}
  </main>
}
