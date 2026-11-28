import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {getAuth,onAuthStateChanged,getIdToken} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
// Same public Firebase project configuration and persisted login as the Novyra dashboard.
const app=getApps().find(app=>app.options.projectId==='pensionsegura-9c817')||initializeApp({apiKey:'AIzaSyAEDygVfkQbJgMuEmm_We-OlQFTKzQ1raM',authDomain:'pensionsegura-9c817.firebaseapp.com',projectId:'pensionsegura-9c817'});
const auth=getAuth(app);
export function session(){return new Promise((resolve,reject)=>{let unsubscribe;unsubscribe=onAuthStateChanged(auth,user=>{unsubscribe?.();if(!user){reject(Error('Inicia sesión en tu cuenta de Novyra para usar la calculadora.'));return;}resolve({uid:user.uid,getToken:()=>getIdToken(user)});},()=>reject(Error('No fue posible verificar tu sesión. Abre tu cuenta de Novyra de nuevo.')));});}
