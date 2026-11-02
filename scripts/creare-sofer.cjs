
const { initializeApp, cert, deleteApp } =
  require('firebase-admin/app')

const { getAuth } =
  require('firebase-admin/auth')

const { getFirestore } =
  require('firebase-admin/firestore')

const fs = require('node:fs')
const path = require('node:path')

const CHEIE = path.join(
  'C:',
  'Users',
  'User8',
  'Belacris-Private',
  'firebase-admin-key.json'
)

// Conturile soferilor BELACRIS SRL
const SOFERI = {
  monoranu: {
    nume: 'Monoranu Gheorghe',
    parola: 'MonoranuG!'
  },
  boroianu: {
    nume: 'Boroianu Constantin',
    parola: 'BoroianuC!'
  }
}

async function configurareSofer(auth, db, username, sofer) {
  const email = `belacris-${username}@example.com`

  let utilizator

  try {
    utilizator = await auth.getUserByEmail(email)

    // Daca exista, actualizam parola.
    utilizator = await auth.updateUser(utilizator.uid, {
      password: sofer.parola,
      displayName: sofer.nume,
      disabled: false
    })

    console.log(`Cont actualizat: ${sofer.nume}`)
  } catch (eroare) {
    if (eroare.code !== 'auth/user-not-found') {
      throw eroare
    }

    // Daca nu exista, cream contul.
    utilizator = await auth.createUser({
      email,
      password: sofer.parola,
      displayName: sofer.nume,
      disabled: false
    })

    console.log(`Cont creat: ${sofer.nume}`)
  }

  // Cream sau actualizam profilul soferului.
  await db.collection('users')
    .doc(utilizator.uid)
    .set(
      {
        name: sofer.nume,
        username,
        role: 'sofer',
        active: true
      },
      { merge: true }
    )

  console.log(`Utilizator: ${username}`)
  console.log('Profil Firebase configurat cu succes!')
  console.log('-----------------------------')
}

async function main() {
  if (!fs.existsSync(CHEIE)) {
    throw new Error('Nu gasesc cheia Firebase la: ' + CHEIE)
  }

  const app = initializeApp({
    credential: cert(CHEIE),
    projectId: 'jarvis-f8677'
  })

  try {
    const auth = getAuth(app)
    const db = getFirestore(app)

    for (const [username, sofer] of Object.entries(SOFERI)) {
      await configurareSofer(auth, db, username, sofer)
    }

    console.log('AMBII SOFERI AU FOST CONFIGURATI!')
  } finally {
    await deleteApp(app)
  }
}

main().catch((eroare) => {
  console.error('EROARE:', eroare.code || eroare.message)
  process.exitCode = 1
})
