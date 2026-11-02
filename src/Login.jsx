import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
import App from './App'
import Soferi from './Soferi'
import './Login.css'
import './BelacrisTheme.css'

function identificatorFirebase(text) {
  const valoare = text.trim().toLowerCase()
  // Conturile soferilor create cu scripts/creare-sofer.cjs.
  // Administratorul continua sa se conecteze cu adresa de e-mail.
  if (/^[a-z0-9_-]{3,30}$/.test(valoare)) {
    return `belacris-${valoare}@example.com`
  }
  return valoare
}

export default function Login() {
  const [user, setUser] = useState(null)
  const [profil, setProfil] = useState(null)
  const [checking, setChecking] = useState(true)
  const [sending, setSending] = useState(false)
  const [identificator, setIdentificator] = useState('')
  const [parola, setParola] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [eroare, setEroare] = useState('')

  useEffect(() => {
    let activ = true

    const unsubscribe = onAuthStateChanged(auth, async (utilizator) => {
      if (!activ) return
      setChecking(true)
      setUser(null)
      setProfil(null)

      if (!utilizator) {
        if (activ) setChecking(false)
        return
      }

      try {
        const rezultat = await getDoc(doc(db, 'users', utilizator.uid))
        if (!activ) return

        const date = rezultat.data()
        if (
          rezultat.exists() &&
          date?.active === true &&
          ['admin', 'sofer'].includes(date.role)
        ) {
          setUser(utilizator)
          setProfil(date)
          setEroare('')
          setParola('')
        } else {
          setEroare('Contul nu este activ sau nu are un profil valid.')
          await signOut(auth)
        }
      } catch (error) {
        console.error('Eroare la verificarea profilului:', error)
        if (activ) {
          setEroare('Nu am putut verifica profilul. Verifica conexiunea la internet.')
        }
      } finally {
        if (activ) setChecking(false)
      }
    })

    return () => {
      activ = false
      unsubscribe()
    }
  }, [])

  async function conectare(event) {
    event.preventDefault()
    if (sending || checking) return
    setEroare('')
    setSending(true)

    try {
      await signInWithEmailAndPassword(
        auth,
        identificatorFirebase(identificator),
        parola
      )
    } catch (error) {
      console.error('Autentificare Firebase:', error.code)
      setEroare('Utilizatorul sau parola sunt incorecte. Verifica datele si incearca din nou.')
    } finally {
      setSending(false)
    }
  }

  async function deconectare() {
    try {
      await signOut(auth)
      setParola('')
      setIdentificator('')
      setShowPassword(false)
    } catch (error) {
      console.error('Deconectare:', error)
      setEroare('Deconectarea a esuat. Incearca din nou.')
    }
  }

  if (checking) {
    return (
      <main className="belacris-loading" role="status" aria-live="polite">
        <div className="belacris-loading__spinner" aria-hidden="true" />
        <p>Se verifică autentificarea...</p>
      </main>
    )
  }

  if (user && profil) {
    return (
      <div className="belacris-session">
        <div className="belacris-session__bar">
          <div className="belacris-session__identity">
            <span className="belacris-session__dot" aria-hidden="true" />
            <span>Conectat: <strong>{profil.name || 'Utilizator'}</strong></span>
            <span className="belacris-session__role">
              {profil.role === 'admin' ? 'Administrator' : 'Șofer'}
            </span>
          </div>
          <button type="button" onClick={deconectare} className="belacris-session__logout">
            Deconectare
          </button>
        </div>
        {profil.role === 'admin' ? <Soferi /> : <App profil={profil} />}
      </div>
    )
  }

  return (
    <main className="belacris-login">
      <div className="belacris-login__visual" aria-hidden="true" />
      <div className="belacris-login__accent" aria-hidden="true" />

      <section className="belacris-login__card" aria-label="Autentificare Belacris Tir">
        <div className="belacris-login__pill">
          <span className="belacris-login__pill-dot" />
          PLATFORMA DE TRANSPORT
        </div>
        <h1>BELACRIS <span>TIR</span></h1>
        <p className="belacris-login__subtitle">Foi de parcurs, într-un singur loc.</p>

        <form onSubmit={conectare} className="belacris-login__form">
          <label htmlFor="login-utilizator">Utilizator sau Email</label>
          <input
            id="login-utilizator"
            type="text"
            required
            autoComplete="username"
            spellCheck="false"
            autoCapitalize="none"
            value={identificator}
            onChange={(event) => setIdentificator(event.target.value)}
            placeholder="Ex.: monoranu sau emailul adminului"
          />

          <label htmlFor="login-parola">Parolă</label>
          <div className="belacris-login__password">
            <input
              id="login-parola"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={parola}
              onChange={(event) => setParola(event.target.value)}
              placeholder="Introdu parola"
            />
            <button
              type="button"
              className="belacris-login__show-password"
              onClick={() => setShowPassword((previous) => !previous)}
              aria-label={showPassword ? 'Ascunde parola' : 'Afișează parola'}
              aria-pressed={showPassword}
            >
              {showPassword ? 'Ascunde' : 'Arată'}
            </button>
          </div>

          {eroare && <p className="belacris-login__error" role="alert">{eroare}</p>}

          <button className="belacris-login__submit" type="submit" disabled={sending}>
            {sending ? 'Se conectează...' : 'Conectare'}
            {!sending && <span aria-hidden="true">→</span>}
          </button>
        </form>

        <div className="belacris-login__footer">
          <span aria-hidden="true">●</span> Acces pentru șoferi și administrator
        </div>
      </section>

      <div className="belacris-login__copyright">BELACRIS SRL · PRO MOBILA</div>
    </main>
  )
}
