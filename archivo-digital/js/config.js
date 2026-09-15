/* =====================================================================
   CONFIGURACIÓN DE FIREBASE (100% GRATIS)
   ---------------------------------------------------------------------
   1) Entrá a https://console.firebase.google.com  (con tu cuenta de Google)
   2) "Crear proyecto" -> poné un nombre (ej: archivo-digital) -> crear
   3) Con el proyecto abierto: ícono "></>" (App web) -> registrá la app
      con cualquier nombre -> copiá el objeto "firebaseConfig" acá abajo.
   4) En el menú de la izquierda: "Firestore Database" + "Storage"
      -> Crear (en modo producción o prueba, da igual, luego se abren).
   ===================================================================== */

const FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

/* =====================================================================
   PIN DE ACCESO OPCIONAL
   Si dejás "" la web es abierta (cualquiera entra y puede subir).
   Si ponés, por ejemplo, "1234", la web pedirá ese PIN para ingresar.
   Cambiá el PIN y cualquier persona que ya tenga el QR lo seguirá usando
   (se le pedirá el PIN al abrir).
   ===================================================================== */
const APP_PIN = "";