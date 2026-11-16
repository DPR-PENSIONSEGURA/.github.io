const BASE='https://api-326bly7kmq-uc.a.run.app/api/v1/admin/panel';
export function saveSession(staff,token){if(token)sessionStorage.setItem('dpr_staff_token',token);localStorage.setItem('staffSession',JSON.stringify(staff));}
export function logout(){sessionStorage.removeItem('dpr_staff_token');localStorage.removeItem('staffSession');location.replace('/staff-login.html?proveedor=1');}
export async function api(path,{method='GET',body,uploadId,actionId,timeout=20000}={}){
 const token=sessionStorage.getItem('dpr_staff_token');if(!token){location.replace('/staff-login.html?proveedor=1');throw new Error('Inicia sesión para continuar.');}
 const form=typeof FormData!=='undefined'&&body instanceof FormData;
 let response;try{response=await fetch(BASE+path,{method,cache:'no-store',headers:{Authorization:'Bearer '+token,...(!form?{'Content-Type':'application/json'}:{}),...(uploadId?{'X-Upload-Id':uploadId}:{}),...(actionId?{'X-Action-Id':actionId}:{})},...(body!==undefined?{body:form?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout)});}catch{throw new Error(method==='GET'?'No se pudo conectar. Vuelve a actualizar.':'No se pudo confirmar la operación. Actualiza la lista antes de volver a enviarla.');}
 const data=await response.json().catch(()=>({}));if(response.status===401){logout();throw new Error('Vuelve a iniciar sesión.');}if(!response.ok||data.success!==true)throw new Error(data.message||'No se pudo completar la operación.');return data;
}
