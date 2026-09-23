# ConectaLSCh v1.5.1 — corrección de guardado

- Elimina el límite fijo de 500 ejemplos de Mis señas.
- IndexedDB sigue siendo el almacenamiento principal; localStorage queda como espejo cuando hay espacio.
- Corrige el mensaje engañoso que indicaba 500 ejemplos aunque hubiera muy pocos.
- Si una captura realmente es incompatible, ahora informa un error de datos en vez de decir que se alcanzó 500.
- Mantiene el seguimiento profesional de manos, movimiento, rostro y pose de v1.5.0.
- Escuchar no se modifica.
