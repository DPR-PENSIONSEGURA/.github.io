import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import {getAuth} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
const config={apiKey:'AIzaSyAEDygVfkQbJgMuEmm_We-OlQFTKzQ1raM',authDomain:'pensionsegura-9c817.firebaseapp.com',projectId:'pensionsegura-9c817',storageBucket:'pensionsegura-9c817.firebasestorage.app',messagingSenderId:'169500313261',appId:'1:169500313261:web:15e2b662571df505d36824'};
export const auth=getAuth(getApps().length?getApp():initializeApp(config));
