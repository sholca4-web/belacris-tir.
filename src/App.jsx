import { useEffect, useRef, useState } from 'react'
import './App.css'
import './FoaieModel.css'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

const initial = { numar: '', data: '', sofer: '', stare: Array.from({length:3},()=>({})), alimentari: Array.from({length:3},()=>({})), ulei: Array.from({length:3},()=>({})), adblue: Array.from({length:3},()=>({})), revizii: Array.from({length:3},()=>({})), parcurs: Array.from({length:17},()=>({})) }
const columns = [
  ['data','DATA'],['kmPlecare','KM PLECARE'],['locPlecare','LOCUL PLECĂRII'],['localitatePlecare','LOCALITATEA'],
  ['km1','KM ÎN BORD'],['loc1','LOCUL'],['localitate1','LOCALITATEA'],
  ['km2','KM ÎN BORD'],['loc2','LOCUL'],['localitate2','LOCALITATEA'],
  ['kmSosire','KM ÎN BORD'],['locSosire','LOCUL'],['localitateSosire','LOCALITATEA'],
  ['cuUrban','URBAN'],['cuExtra','EXTRAURBAN'],['faraUrban','URBAN'],['faraExtra','EXTRAURBAN'],['totalKm','TOTAL KILOMETRI'],['semnatura','SEMNĂTURA']
]
function SheetInput({value, onChange, type='text', label}) {
  return <input aria-label={label} type={type} value={value || ''} onChange={e=>onChange(e.target.value)} />
}
function SignModal({onSave,onClose}) {
  const canvas = useRef(null)
  const drawing = useRef(false)
  useEffect(()=>{
    const el=canvas.current; const ctx=el.getContext('2d'); ctx.lineWidth=2.5; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.strokeStyle='#111827'
  },[])
  function coords(e){const r=canvas.current.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.current.width/r.width,y:(e.clientY-r.top)*canvas.current.height/r.height}}
  function down(e){e.preventDefault(); canvas.current.setPointerCapture(e.pointerId);drawing.current=true;const p=coords(e);const ctx=canvas.current.getContext('2d');ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+.1,p.y+.1);ctx.stroke()}
  function move(e){if(!drawing.current)return;const p=coords(e),ctx=canvas.current.getContext('2d');ctx.lineTo(p.x,p.y);ctx.stroke()}
  return <div className="overlay"><div className="modal"><h3>Semnează în chenar</h3><p>Cu degetul pe telefon sau mouse-ul pe calculator.</p><canvas ref={canvas} width="650" height="220" onPointerDown={down} onPointerMove={move} onPointerUp={()=>drawing.current=false} onPointerCancel={()=>drawing.current=false}/><div className="actions"><button onClick={()=>canvas.current.getContext('2d').clearRect(0,0,650,220)}>Șterge</button><button onClick={onClose}>Anulează</button><button onClick={()=>onSave(canvas.current.toDataURL('image/png'))}>Salvează semnătura</button></div></div></div>
}
function App({ profil }) {
  const [page, setPage] = useState(
  profil?.role === 'admin' ? 'admin' : 'sofer'
)
const esteAdmin = profil?.role === 'admin'

function schimbaPagina(destinatie) {
  if (destinatie === 'admin' && !esteAdmin) {
    return
  }

  setPage(destinatie)
}

  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const uid = auth.currentUser?.uid
  const sheetId = uid ? `${uid}_${month}` : null
  const [fisa, setFisa] = useState(() => structuredClone(initial))
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState('Se încarcă foaia...')
  const [signatureTarget, setSignatureTarget] = useState(null)
  const dirtyRef = useRef(false)
  const timerRef = useRef(null)
  const dataRef = useRef(structuredClone(initial))
  const docRef = useRef(null)

  useEffect(() => {
    if (!sheetId || !uid) return
    let active = true
    clearTimeout(timerRef.current)
    dirtyRef.current = false
    setLoaded(false)
    setStatus('Se încarcă foaia...')
    const empty = structuredClone(initial)
    dataRef.current = empty
    setFisa(empty)
    const reference = doc(db, 'foiParcurs', sheetId)
    docRef.current = reference
    const unsubscribe = onSnapshot(reference, { includeMetadataChanges: true }, (snapshot) => {
      if (!active) return
      const waiting = snapshot.metadata.hasPendingWrites
      // Nu suprascriem ceea ce tastează șoferul înainte de sincronizare.
      if (!dirtyRef.current || (!waiting && !timerRef.current)) {
        if (snapshot.exists()) {
          const values = snapshot.data().continut || {}
          const normalized = structuredClone(initial)
          for (const key of Object.keys(normalized)) {
            if (Array.isArray(normalized[key])) {
              if (Array.isArray(values[key])) normalized[key] = values[key]
            } else if (typeof values[key] === 'string') normalized[key] = values[key]
          }
          dataRef.current = normalized
          setFisa(normalized)
        }
        if (!waiting) dirtyRef.current = false
      }
      setLoaded(true)
      setStatus(waiting ? 'Modificări în așteptarea serverului' :
        snapshot.metadata.fromCache ? 'Date locale · conexiunea nu este confirmată' : 'Sincronizat cu Firebase')
    }, (error) => {
      console.error('Firestore:', error)
      if (active) {
        setLoaded(true)
        setStatus(`Eroare de sincronizare: ${error.code || error.message}`)
      }
    })
    return () => {
      active = false
      clearTimeout(timerRef.current)
      unsubscribe()
    }
  }, [sheetId, uid])

  function saveNow(reference, values) {
    if (!reference || !uid) return
    setStatus('Salvare în curs...')
    const payload = {
      ownerUid: uid,
      ownerName: profil?.name || 'Șofer',
      luna: month,
      numar: values.numar || '',
      continut: values
    }
    // Așteaptă confirmarea serverului prin onSnapshot; offline scrierea rămâne în coadă.
    setDoc(reference, payload).catch(error => {
      console.error('Eroare salvare foaie:', error)
      setStatus(`Salvarea a eșuat: ${error.code || error.message}`)
    })
  }

  function updateFisa(makeNext) {
    if (!loaded) return
    const next = makeNext(dataRef.current)
    dataRef.current = next
    dirtyRef.current = true
    setFisa(next)
    setStatus('Modificări nesincronizate...')
    clearTimeout(timerRef.current)
    const reference = docRef.current
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      saveNow(reference, dataRef.current)
    }, 650)
  }

  function changeMonth(next) {
    if (!next || next === month) return
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      saveNow(docRef.current, dataRef.current)
    }
    setMonth(next)
  }

  function setHeader(k, v) { updateFisa(f => ({ ...f, [k]: v })) }
  function setCell(section, index, k, v) {
    updateFisa(f => ({ ...f, [section]: f[section].map((row, i) =>
      i === index ? { ...row, [k]: v } : row) }))
  }
  function sign(section,index){setSignatureTarget({section,index})}
  // Totalul este doar calculat la afisare; nu modifica datele deja salvate in Firebase.
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

  function tableRow(section, i, fields) {
    const row = fisa[section][i] || {}
    return (
      <tr key={i}>
        {fields.map(([key, title]) => (
          <td key={key}>
            {key === 'semnatura' ? (
              <button className="signature-cell" onClick={() => sign(section, i)}>
                {row[key] ? <img src={row[key]} alt="Semnatura" /> : 'Semnează'}
              </button>
            ) : key === 'totalKm' ? (
              <output aria-label="Total kilometri">{totalKilometri(row)}</output>
            ) : (
              <SheetInput
                label={title}
                value={row[key]}
                onChange={v => setCell(section, i, key, v)}
              />
            )}
          </td>
        ))}
      </tr>
    )
  }
  function smallTable(name, fields) {
    const esteAlimentari = name === 'ALIMENTĂRI'
    return (
      <table className="small-table belacris-model-small">
        <thead>
          <tr><th colSpan={fields.length}>{name}</th></tr>
          {esteAlimentari ? (
            <>
              <tr>
                <th rowSpan={2}>DATA</th>
                <th rowSpan={2}>SEDIUL SOCIETĂȚII</th>
                <th colSpan={2}>STAȚIE PECO</th>
                <th rowSpan={2}>SEMNĂTURĂ</th>
              </tr>
              <tr><th>ACREDITATĂ</th><th>ALTELE</th></tr>
            </>
          ) : (
            <tr>{fields.map(([key, title]) => <th key={key}>{title}</th>)}</tr>
          )}
        </thead>
        <tbody>
          {fisa[tableNames[name]].map((_, i) => tableRow(tableNames[name], i, fields))}
        </tbody>
      </table>
    )
  }
  const tableNames={'STAREA AUTOVEHICULULUI':'stare','ALIMENTĂRI':'alimentari','ULEI':'ulei','ADBLUE':'adblue','REVIZII/ITP':'revizii'}
  const groups=[['STAREA AUTOVEHICULULUI',[['data','DATA'],['stare','STAREA AUTOVEHICULULUI'],['semnatura','SEMNĂTURA']]],['ALIMENTĂRI',[['data','DATA'],['sediu','SEDIUL SOCIETĂȚII'],['peco','ACREDITATĂ'],['altele','ALTELE'],['semnatura','SEMNĂTURA']]],['ULEI',[['data','DATA'],['schimb','SCHIMB ULEI'],['completare','COMPLETARE ULEI'],['semnatura','SEMNĂTURA']]],['ADBLUE',[['data','DATA'],['cantitate','CANTITATEA'],['semnatura','SEMNĂTURA']]],['REVIZII/ITP',[['data','DATA'],['aspecte','ASPECTE VIZATE'],['semnatura','SEMNĂTURA']]]]
  return <div className="application"><header className="topbar"><strong>BELACRIS SRL</strong><span>Gestionare foi de parcurs</span></header>{page==='acasa'?<main className="home"><h2>Bine ai venit!</h2><p>Alege modul de utilizare</p><button onClick={()=>setPage('sofer')}>🚛 Panou șofer</button><button onClick={()=>setPage('admin')}>🖥️ Panou administrator</button><p className="muted">Conturile sunt în Firebase; folosește date fictive la testare.</p></main>:page==='admin'?<main className="home"><h2>Panou administrator</h2><p>Va afișa foile sincronizate după configurarea conturilor și a bazei de date.</p><button onClick={()=>setPage('acasa')}>Înapoi</button></main>:<><div className="toolbar"><button onClick={()=>setPage('acasa')}>← Înapoi</button><label>Luna foii <input type="month" value={month} onChange={e=>changeMonth(e.target.value)}/></label><span>{status}</span></div><div className="scroll-paper"><div className="paper"><h2>FOAIE DE PARCURS</h2><div className="meta"><b>SC BELACRIS SRL</b><label>NUMĂR ÎNMATRICULARE: <SheetInput label="Număr înmatriculare" value={fisa.numar} onChange={v=>setHeader('numar',v)}/></label><div><label>DATA EMITERII: <SheetInput label="Data emiterii" type="date" value={fisa.data} onChange={v=>setHeader('data',v)}/></label><label>CONDUCĂTOR AUTO: <SheetInput label="Conducător auto" value={fisa.sofer} onChange={v=>setHeader('sofer',v)}/></label></div></div><div className="table-pair">{groups.slice(0,2).map(([title,fields])=><div key={title}>{smallTable(title,fields)}</div>)}</div><div className="table-triple">{groups.slice(2).map(([title,fields])=><div key={title}>{smallTable(title,fields)}</div>)}</div><table className="journey belacris-model-journey"><thead>
    <tr>
      <th rowSpan="3">DATA</th>
      <th rowSpan="3">KM PLECARE</th>
      <th rowSpan="3">LOCUL PLECĂRII</th>
      <th rowSpan="3">LOCALITATEA</th>
      <th colSpan="3">STAȚIA INTERMEDIARĂ</th>
      <th colSpan="3">STAȚIA INTERMEDIARĂ</th>
      <th colSpan="3">SOSIRE</th>
      <th colSpan="5">TOTAL KM EFECTUAȚI</th>
      <th rowSpan="3">SEMNĂTURA</th>
    </tr>
    <tr>
      {columns.slice(4, 13).map(([key, title]) => (
        <th rowSpan="2" key={key}>{title}</th>
      ))}
      <th colSpan="2">CU ÎNCĂRCĂTURĂ</th>
      <th colSpan="2">FĂRĂ ÎNCĂRCĂTURĂ</th>
      <th rowSpan="2">TOTAL KILOMETRI</th>
    </tr>
    <tr>
      <th>URBAN</th><th>EXTRAURBAN</th>
      <th>URBAN</th><th>EXTRAURBAN</th>
    </tr>
  </thead><tbody>{fisa.parcurs.slice(0,6).map((_,i)=>tableRow('parcurs',i,columns))}</tbody></table><div className="page-break">CONTINUARE — PAGINA 2</div><table className="journey belacris-model-journey"><tbody>{fisa.parcurs.slice(6).map((_,j)=>tableRow('parcurs',j+6,columns))}</tbody></table></div></div></>}{signatureTarget&&<SignModal onClose={()=>setSignatureTarget(null)} onSave={data=>{setCell(signatureTarget.section,signatureTarget.index,'semnatura',data);setSignatureTarget(null)}}/>}</div>
}
export default App