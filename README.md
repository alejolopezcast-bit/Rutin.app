# Rutin.app

App para llevar tu rutina diaria, tus tareas pendientes y tus pomodoros. Cada hábito
se registra **por veces** (pulsas el botón y suma una sesión) o **por tiempo** (pulsas
y arranca una cuenta atrás), o las dos cosas a la vez.

No necesita servidor ni cuenta: es HTML, CSS y JavaScript sin dependencias, y tus datos
se guardan en el navegador (`localStorage`).

## Cómo usarla

Abre `index.html` en el navegador. Si prefieres servirla (necesario para instalarla como
app y para el modo sin conexión):

```bash
npx http-server -p 8080 .   # y abre http://localhost:8080
```

En Ajustes tienes **Cargar rutina de ejemplo** para ver la app con datos.

## Qué puede hacer

### Rutinas

Al crear una rutina eliges cómo la quieres registrar:

| Modo | Cómo se usa | Ejemplo |
| --- | --- | --- |
| **Por veces** | Pulsas el botón y suma una sesión hecha. La meta es un número de veces al día. | Gimnasio 1 vez al día, beber agua 8 veces |
| **Por tiempo** | Pulsas y arranca una cuenta atrás. Al acabar se registra la sesión con sus minutos. | Leer 30 min, meditar 10 min |
| **Las dos** | Tienes los dos botones: marcas rápido o cronometras según el día. | Gimnasio: unos días lo marcas, otros cronometras la hora |

Además de eso:

- **Días de la semana**: cada rutina se programa en los días que quieras. Los días que
  no toca siguen visibles con la etiqueta *Hoy no toca*, por si te apetece hacerla igual.
- **⏱ Otra duración**: arranca la cuenta atrás con los minutos que le digas, no sólo con
  los de la rutina.
- **↺ Deshacer**: quita el último registro del día si te has equivocado.
- **Rachas**: días seguidos cumpliendo la rutina.

### Cuenta atrás

Cuando hay una sesión en marcha aparece una barra flotante con el tiempo restante:

- **Pausar / Reanudar** sin perder lo que llevas.
- **Terminar** registra los minutos hechos hasta ese momento.
- **✕** cancela sin registrar nada.
- La sesión sobrevive a recargas y a cerrar la pestaña: al volver sigue en su sitio (y si
  el tiempo se cumplió mientras no estabas, queda registrada).
- Avisa con un sonido y, si le das permiso, con una notificación del navegador.

### Tareas y pomodoros

- Lista de pendientes con pomodoros estimados (`0/3 🍅`) y los que ya llevas.
- El botón 🍅 de una tarea abre el pomodoro ya asociado a ella: cada pomodoro completado
  se le suma.
- Duraciones configurables (concentración, descanso corto, descanso largo y cada cuántos
  pomodoros toca el largo) y opción de encadenarlos automáticamente.

### Progreso

Sesiones, tiempo y pomodoros de los últimos 7 días, gráfico diario, rachas por rutina e
historial reciente (con opción de borrar registros sueltos).

### Tus datos

Todo vive en tu navegador. En Ajustes puedes **exportar** una copia en JSON, **importarla**
en otro dispositivo o **borrar** todo. Servida por HTTP se instala como app (PWA) y funciona
sin conexión.

## Estructura

```
index.html         Estructura de las vistas y del diálogo de rutinas
assets/styles.css  Estilos (tema oscuro y claro)
assets/icon.svg    Icono de la app
src/store.js       Estado, persistencia, progreso y rachas
src/timer.js       Motor de cuentas atrás y pomodoros
src/ui.js          Pintado de las vistas
src/app.js         Arranque y eventos
manifest.json      Manifiesto PWA
sw.js              Service worker (uso sin conexión)
```
