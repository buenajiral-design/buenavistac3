# Mapa de Buena Vista

Se ajustó el mapa para que, cuando una ubicación todavía no está guardada, siempre comience en:

- Latitud: **9.273936**
- Longitud: **-79.695537**
- Zoom inicial: **14**

Además, al guardar una ubicación, el enlace generado para visitantes apunta a Google Maps con zoom 18.

## Sobre usar Google Maps como mapa interactivo

La versión actual usa Leaflet + OpenStreetMap para el selector interactivo porque Google Maps JavaScript API requiere una clave de Google Maps Platform. Para cambiar completamente el selector a Google Maps (con clic, arrastre y búsqueda de Google), hay que configurar una API key de Google y habilitar Maps JavaScript API.

Documentación oficial: https://developers.google.com/maps/documentation/javascript/get-api-key
