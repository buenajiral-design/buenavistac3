/* Instalar desde una hoja NUEVA de Google Sheets: Extensiones > Apps Script.
   Usa únicamente la clave pública existente y respeta RLS. */
const BV_URL = 'https://lscvlvbdjrebobqhvbxv.supabase.co';
const BV_KEY = 'sb_publishable_96_GcA6a5qzqWXsDKg8TtA_lCx_D1Sq';
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Buena Vista')
    .addItem('Activar actualización automática', 'activarBuenaVista')
    .addItem('Actualizar ahora', 'sincronizarBuenaVista')
    .addItem('Cambiar hoja de destino', 'cambiarDestinoBuenaVista')
    .addItem('Detener actualización', 'detenerBuenaVista').addToUi();
}
function activarBuenaVista() {
  const props = PropertiesService.getUserProperties();
  if (!props.getProperty('BV_HOJA')) props.setProperty('BV_HOJA', SpreadsheetApp.getActiveSpreadsheet().getId());
  sincronizarBuenaVista();
  detenerBuenaVista();
  ScriptApp.newTrigger('sincronizarBuenaVista').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert('Activado. Los puntos publicados se copiarán cada cinco minutos. Consulta la pestaña Estado.');
}
function detenerBuenaVista() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sincronizarBuenaVista').forEach(t => ScriptApp.deleteTrigger(t));
}
function cambiarDestinoBuenaVista() {
  const ui = SpreadsheetApp.getUi();
  const respuesta = ui.prompt('Cambiar destino', 'Pega el enlace de una hoja NUEVA de Google Sheets. Tu cuenta debe tener permiso para editarla. No cambia el propietario ni la cuenta que ejecuta el script.', ui.ButtonSet.OK_CANCEL);
  if (respuesta.getSelectedButton() !== ui.Button.OK) return;
  const match = respuesta.getResponseText().trim().match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error('Enlace de Google Sheets inválido.');
  const nueva = SpreadsheetApp.openById(match[1]);
  const props = PropertiesService.getUserProperties();
  const anterior = props.getProperty('BV_HOJA');
  props.setProperty('BV_HOJA', nueva.getId());
  try { sincronizarBuenaVista(); } catch (e) {
    if (anterior) props.setProperty('BV_HOJA', anterior); else props.deleteProperty('BV_HOJA');
    throw e;
  }
  ui.alert('Destino cambiado. Los siguientes registros se copiarán aquí: ' + nueva.getUrl() + '. La hoja anterior conserva su última copia.');
}
function puntosBuenaVista(publicaciones) {
  const puntos = [];
  publicaciones.filter(p => p.estado === 'publicado').forEach(pub => {
    let bloques = pub.bloques || [];
    if (typeof bloques === 'string') bloques = JSON.parse(bloques);
    function recorrer(v, ruta) {
      if (!v || typeof v !== 'object') return;
      if (v.tipo === 'mapa' && v.lat !== null && v.lat !== undefined && v.lng !== null && v.lng !== undefined && String(v.lat).trim() !== '' && String(v.lng).trim() !== '') {
        const lat = Number(v.lat), lng = Number(v.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          puntos.push([String(pub.id) + ':' + (v.id || ruta), pub.titulo || 'Ubicación', pub.seccion_id || '', lat, lng,
            'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng]);
        }
      }
      Object.keys(v).forEach(k => recorrer(v[k], ruta + '.' + k));
    }
    recorrer(bloques, 'bloques');
  });
  return puntos;
}
function sincronizarBuenaVista() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  let libro;
  try {
    const id = PropertiesService.getUserProperties().getProperty('BV_HOJA');
    if (!id) throw new Error('Ejecuta activarBuenaVista primero.');
    libro = SpreadsheetApp.openById(id);
    const publicaciones = [];
    for (let offset = 0; ; ) {
      const url = BV_URL + '/rest/v1/bv_contenido?select=id,titulo,seccion_id,bloques,estado&estado=eq.publicado&order=id.asc&limit=500&offset=' + offset;
      const res = UrlFetchApp.fetch(url, {headers: {apikey: BV_KEY}, muteHttpExceptions: true});
      if (res.getResponseCode() !== 200 && res.getResponseCode() !== 206) throw new Error('No se pudieron leer las publicaciones. HTTP ' + res.getResponseCode());
      const pagina = JSON.parse(res.getContentText());
      if (!Array.isArray(pagina)) throw new Error('Respuesta inválida del servidor.');
      if (!pagina.length) break;
      publicaciones.push(...pagina); offset += pagina.length;
    }
    const filas = [['ID', 'Nombre', 'Sección', 'Latitud', 'Longitud', 'Google Maps'], ...puntosBuenaVista(publicaciones)];
    // Neutraliza fórmulas introducidas en nombres o identificadores.
    const seguras = filas.map(f => f.map(v => typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v));
    const hoja = libro.getSheetByName('Puntos') || libro.insertSheet('Puntos');
    if (hoja.getMaxRows() < filas.length) hoja.insertRowsAfter(hoja.getMaxRows(), filas.length - hoja.getMaxRows());
    const anteriores = hoja.getLastRow();
    hoja.getRange(1, 1, seguras.length, 6).setValues(seguras);
    if (anteriores > seguras.length) hoja.getRange(seguras.length + 1, 1, anteriores - seguras.length, 6).clearContent();
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, 6).setBackground('#304d3f').setFontColor('#ffffff').setFontWeight('bold');
    const estado = libro.getSheetByName('Estado') || libro.insertSheet('Estado');
    estado.getRange(1, 1, 5, 2).setValues([
      ['Resultado', 'Actualizado'], ['Última actualización correcta', new Date()], ['Puntos publicados', filas.length - 1],
      ['Cuenta que ejecuta', Session.getEffectiveUser().getEmail() || 'Cuenta que activó el script'],
      ['Último error', '']]);
  } catch (e) {
    if (libro) {
      const estado = libro.getSheetByName('Estado') || libro.insertSheet('Estado');
      estado.getRange(1, 1, 1, 2).setValues([['Resultado', 'ERROR: no se completó la actualización']]);
      estado.getRange(5, 1, 1, 2).setValues([['Último error', String(e.message).slice(0, 500)]]);
    }
    throw e;
  } finally { lock.releaseLock(); }
}
