# Solución para Cloudflare "Actividad automática detectada"

## Problema
Cloudflare detecta el navegador como automatizado y muestra:
> "Actividad automática detectada. Inténtalo de nuevo más tarde."

## ¿Por qué Cloudflare es tan difícil?

Cloudflare usa múltiples técnicas de detección:
1. **Fingerprinting del navegador**: Analiza propiedades de JavaScript
2. **Análisis de comportamiento**: Detecta patrones no humanos (velocidad, movimientos)
3. **TLS fingerprinting**: Analiza la conexión SSL/TLS
4. **Verificación de headers HTTP**: Busca inconsistencias
5. **Challenge JavaScript**: Ejecuta código que verifica el entorno
6. **Machine Learning**: Modelos entrenados para detectar bots

## Mejoras Implementadas

### 1. Script Anti-Detección Avanzado
✅ **22 técnicas de evasión** implementadas:
- Webdriver oculto completamente
- Todas las propiedades CDP/Selenium eliminadas
- Chrome API completo y funcional
- Plugins realistas con estructura correcta
- MimeTypes configurados
- Canvas fingerprint con ruido
- WebGL fingerprint modificado
- Performance timing realista
- Error stack traces limpios
- MouseEvent con isTrusted
- Timezone consistente

### 2. Headers HTTP Optimizados
- User-Agent actualizado (Chrome 134)
- sec-ch-ua headers correctos
- Accept headers específicos por tipo de recurso
- Upgrade-Insecure-Requests presente

### 3. Comportamiento Humano Simulado
- Delays aleatorios en carga de páginas (100-300ms)
- Variación en RTT de conexión
- Battery level variable
- Performance timing con variación

## Estrategias Adicionales

### Estrategia 1: Esperar antes de interactuar
```javascript
// Después de cargar la página, espera 2-5 segundos
await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
```

### Estrategia 2: Simular movimiento de mouse
Cloudflare detecta si NO hay movimiento de mouse. Considera:
- Mover el mouse manualmente sobre la página
- Hacer scroll lentamente
- Hacer clic en elementos visibles

### Estrategia 3: Cookies persistentes
Cloudflare usa cookies para "recordar" navegadores legítimos:
1. Visita el sitio manualmente primero
2. Completa el challenge de Cloudflare
3. Las cookies se guardarán automáticamente
4. Futuras visitas serán más fáciles

### Estrategia 4: No hacer requests demasiado rápido
```javascript
// Mal: requests inmediatas
await fetch('/api/data1');
await fetch('/api/data2');
await fetch('/api/data3');

// Bien: con delays
await fetch('/api/data1');
await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
await fetch('/api/data2');
await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
await fetch('/api/data3');
```

### Estrategia 5: Viewport y resolución realistas
Cloudflare verifica que el viewport sea consistente:
- No uses tamaños extraños (ej: 800x600)
- Usa resoluciones comunes: 1920x1080, 1366x768, 1440x900

### Estrategia 6: Limpia cookies si estás bloqueado
Si Cloudflare te bloqueó, las cookies pueden estar marcadas:
```javascript
// En DevConsole:
await window.electronAPI.clearCookies();
await window.electronAPI.clearCache();
```
Luego reinicia el navegador.

## Cómo Probar

### 1. Sitios de prueba Cloudflare
```
https://nowsecure.nl/
https://check.torproject.org/
https://www.cloudflare.com/
```

### 2. Verificar fingerprint
```
https://abrahamjuliot.github.io/creepjs/
https://coveryourtracks.eff.org/
```

### 3. Test de bot detection
```
https://bot.sannysoft.com/
https://arh.antoinevastel.com/bots/areyouheadless
```

## Limitaciones Conocidas

### ❌ No se puede evadir al 100%
Cloudflare es muy sofisticado. Algunas técnicas que NO podemos evadir:
- **TLS fingerprinting**: Electron usa una versión específica de Chromium
- **Timing attacks**: Cloudflare mide tiempos de ejecución de JavaScript
- **Behavioral analysis**: Patrones de uso a largo plazo

### ⚠️ Sitios con protección máxima
Algunos sitios tienen Cloudflare en modo "I'm Under Attack":
- Requieren challenge JavaScript complejo
- Pueden requerir CAPTCHA
- Pueden bloquear por IP/ASN

### ✅ Lo que SÍ funciona
- Sitios con Cloudflare básico
- Sitios después de completar el challenge manualmente
- Navegación normal (no scraping agresivo)
- Uso con cookies persistentes

## Mejores Prácticas

### 1. Comportamiento Humano
```javascript
// Simula lectura de contenido
async function humanBehavior() {
  // Scroll lento
  for (let i = 0; i < 5; i++) {
    window.scrollBy(0, 100 + Math.random() * 200);
    await new Promise(r => setTimeout(r, 500 + Math.random() * 1000));
  }
  
  // Pausa como si estuvieras leyendo
  await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
}
```

### 2. Manejo de Errores
```javascript
async function navigateWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await window.electronAPI.navigateTo(activeTabId, url);
      
      // Esperar carga
      await new Promise(r => setTimeout(r, 2000));
      
      // Verificar si hay challenge de Cloudflare
      const hasChallenge = await window.electronAPI.executeJs(
        activeTabId,
        'document.title.includes("Just a moment") || document.body.innerText.includes("Checking your browser")'
      );
      
      if (hasChallenge.result) {
        console.log('Cloudflare challenge detectado, esperando...');
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      
      return true;
    } catch (e) {
      console.error(\`Intento \${i + 1} falló:\`, e);
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return false;
}
```

### 3. Rotación de User-Agent (Avanzado)
Si un sitio te bloquea consistentemente, puedes intentar:
```javascript
// Cambiar User-Agent (requiere modificar electron/main.js)
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.82 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6943.60 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.82 Safari/537.36'
];
```

## Debugging

### Ver qué detecta Cloudflare
1. Abre DevConsole
2. Ve a la pestaña "Console"
3. Ejecuta:
```javascript
console.log('webdriver:', navigator.webdriver);
console.log('plugins:', navigator.plugins.length);
console.log('languages:', navigator.languages);
console.log('chrome:', typeof window.chrome);
console.log('permissions:', typeof navigator.permissions);
```

### Verificar headers enviados
1. Abre DevConsole
2. Ve a "Network"
3. Recarga la página
4. Inspecciona el primer request
5. Verifica headers:
   - User-Agent debe ser Chrome 134
   - sec-ch-ua debe estar presente
   - Upgrade-Insecure-Requests debe ser 1

## Soluciones Alternativas

### Si nada funciona:
1. **Usa un proxy residencial**: Cloudflare bloquea IPs de datacenters
2. **Completa el challenge manualmente**: Una vez pasado, las cookies te permitirán navegar
3. **Contacta al sitio**: Algunos sitios tienen APIs oficiales
4. **Usa rate limiting**: No hagas más de 1 request por segundo
5. **Cambia de IP**: Si tu IP está bloqueada, usa otra red

## Monitoreo

### Logs útiles
El navegador ahora imprime en consola:
```
[Anti-Detection] Cloudflare bypass initialized
```

Si ves este mensaje, el script se cargó correctamente.

### Verificar en tiempo real
```javascript
// En la consola del navegador (F12)
console.log('[TEST] webdriver:', navigator.webdriver);
console.log('[TEST] plugins:', navigator.plugins.length);
console.log('[TEST] chrome:', !!window.chrome);
```

## Conclusión

Las mejoras implementadas aumentan significativamente las posibilidades de pasar Cloudflare, pero **no hay garantía al 100%**. Cloudflare es un sistema adaptativo que evoluciona constantemente.

**Recomendación**: Usa el navegador para tareas legítimas, simula comportamiento humano, y no hagas scraping agresivo. Si necesitas automatización pesada, considera usar APIs oficiales o servicios especializados.
