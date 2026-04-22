# Navegador Web con Electron + Vite + React

Un navegador web completamente funcional construido con Electron, Vite.js y React.

## 🚀 Características

- ✅ Múltiples pestañas
- ✅ Navegación (adelante, atrás, recargar)
- ✅ Barra de búsqueda/URL inteligente
- ✅ Sistema de marcadores (favoritos)
- ✅ Historial de navegación
- ✅ **Persistencia de cookies y sesiones** (mantiene tus logins activos)
- ✅ **Cache inteligente** (carga más rápida de sitios visitados)
- ✅ **Almacenamiento local** de marcadores e historial
- ✅ **Gestión de descargas**
- ✅ **Panel de configuración** para limpiar datos
- ✅ Interfaz moderna y oscura
- ✅ Indicador de conexión segura (HTTPS)
- ✅ Búsqueda en Google integrada
- ✅ User agent real (los sitios no detectan que es Electron)

## 📋 Requisitos previos

- Node.js (versión 16 o superior)
- npm o yarn

## 🔧 Instalación

1. Instala las dependencias:

```bash
npm install
# o si usas bun
bun install
```

## 🎮 Uso

### Modo desarrollo

Para ejecutar el navegador en modo desarrollo:

```bash
npm run dev
# o si usas bun
bun run dev
```

Esto iniciará Vite y abrirá la aplicación Electron automáticamente.

**Nota:** El navegador usa `BrowserView` nativo de Electron para mostrar contenido web, lo que permite cargar cualquier sitio sin restricciones CORS.

### Compilar para producción

Para crear un ejecutable:

```bash
npm run build
```

El ejecutable se generará en la carpeta `release/`.

## 🎯 Funcionalidades

### Pestañas
- Haz clic en el botón `+` para agregar una nueva pestaña
- Haz clic en la `×` de cada pestaña para cerrarla
- Cambia entre pestañas haciendo clic en ellas

### Navegación
- **←** : Ir atrás
- **→** : Ir adelante
- **↻** : Recargar página
- **Barra de URL**: Escribe una URL o término de búsqueda

### Marcadores
- **⭐** : Agregar la página actual a marcadores
- **📚** : Ver lista de marcadores
- Haz clic en un marcador para navegar a él
- Elimina marcadores con el botón `×`

### Historial
- **🕐** : Ver historial de navegación
- Muestra fecha y hora de cada visita
- Haz clic en cualquier entrada para volver a visitarla
- Se guarda automáticamente en tu dispositivo

### Configuración
- **⋮** : Abrir panel de configuración
- Ver tamaño del cache
- Limpiar cache del navegador
- Eliminar cookies (cerrarás sesión en todos los sitios)
- Eliminar todos los datos de navegación

## 🔐 Privacidad y Persistencia

### Cookies y Sesiones
- Las cookies se guardan automáticamente usando `persist:browsersession`
- Tus sesiones permanecen activas entre reinicios de la aplicación
- No necesitas volver a iniciar sesión cada vez

### Cache
- El navegador guarda hasta 500 MB de cache
- Los sitios web cargan más rápido en visitas posteriores
- Puedes limpiar el cache desde Configuración

### Datos Locales
- Marcadores e historial se guardan en tu dispositivo
- Ubicación: `%APPDATA%/electron-browser/BrowserData/`
- Los datos persisten entre sesiones

## 🛠️ Tecnologías utilizadas

- **Electron**: Framework para aplicaciones de escritorio
- **Vite**: Build tool y dev server ultrarrápido
- **React**: Biblioteca para construir interfaces de usuario
- **CSS3**: Estilos modernos y responsivos

## 📁 Estructura del proyecto

```
electron-browser/
├── electron/
│   ├── main.js          # Proceso principal de Electron
│   └── preload.js       # Script de precarga
├── src/
│   ├── components/
│   │   ├── TabBar.jsx           # Barra de pestañas
│   │   ├── NavigationBar.jsx    # Barra de navegación
│   │   ├── BrowserView.jsx      # Vista del navegador
│   │   └── Sidebar.jsx          # Panel lateral
│   ├── App.jsx          # Componente principal
│   ├── App.css
│   ├── main.jsx         # Punto de entrada
│   └── index.css
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 🎨 Personalización

Puedes personalizar los colores y estilos editando los archivos CSS en `src/components/`.

## ⚠️ Notas importantes

- Este navegador usa `BrowserView` nativo de Electron para mostrar contenido web real sin restricciones
- Todos los sitios web cargan correctamente sin problemas de CORS
- Los iconos usan `react-icons` para una apariencia profesional
- El contenido web se renderiza en un proceso separado para mejor rendimiento y seguridad
- **Las cookies y sesiones persisten automáticamente** - tus logins se mantienen activos
- El cache mejora significativamente la velocidad de carga en visitas repetidas
- Todos los datos se almacenan localmente en tu dispositivo

## 📝 Licencia

MIT

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor, abre un issue o pull request.
