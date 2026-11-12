// Para probar de a una sola sala (por ejemplo ["Depression"]).
// En null se juega el recorrido completo.
// const DEBUG_ONLY_ROOMS = ["Bargaining"];
const DEBUG_ONLY_ROOMS = null;
// Objeto que cada sala deja en el memorial de la sala de Aceptación
const MEMORY_ITEMS = {
  Denial: "vase", // el florero con flores
  Anger: "photo", // el portarretratos cálido
  Bargaining: "key", // la llave
  Depression: "lantern", // el farol chico
};

export class GameManager {
  constructor() {
    // Todas las salas menos Aceptación (esa llega siempre al final del recorrido)
    this.availableRooms = DEBUG_ONLY_ROOMS
      ? [...DEBUG_ONLY_ROOMS]
      : ["Denial", "Anger", "Bargaining", "Depression"];

    this.completedRooms = 0;
    this.memories = []; // objetos del recorrido, en el orden en que se completaron las salas

    // Largo total del viaje, contando la Aceptación:
    // 4 salas -> 3 etapas y la Aceptación (una etapa queda sin visitar)
    // 5 salas -> las 4 etapas y la Aceptación
    this.targetRoomCount = Math.random() < 0.5 ? 4 : 5;

    this.shuffleArray(this.availableRooms);
  }

  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  getNextRoom() {
    // Siempre se recorren al menos 3 salas. Después llega la Aceptación, como 4ta o 5ta
    // sala, y es el final del recorrido (no se vuelve a otra etapa).
    if (
      this.completedRooms >= this.targetRoomCount - 1 ||
      this.availableRooms.length === 0
    ) {
      return "Acceptance";
    }
    return this.availableRooms.pop();
  }

  // Se llama una sola vez por sala, con su nombre, cuando el usuario la completa
  markRoomCompleted(roomName) {
    const item = MEMORY_ITEMS[roomName];
    if (item && !this.memories.includes(item)) this.memories.push(item);
    this.completedRooms++;
    // Devuelve true cuando ya se recorrieron todas las salas previas a la Aceptación
    return this.completedRooms >= this.targetRoomCount - 1;
  }

  // Calcula cómo se debe ver el pasillo (0 a 3) dependiendo de cuántas salas completamos
  // y si la partida es de 4 o 5 salas.
  getCorridorState() {
    if (this.targetRoomCount === 4) {
      // Progresión lineal: 0 -> 1 -> 2 -> 3
      return Math.min(3, this.completedRooms);
    } else {
      // Progresión estirada (5 salas): 0 -> 1 -> 1 -> 2 -> 3
      if (this.completedRooms === 0) return 0;
      if (this.completedRooms === 1) return 1;
      if (this.completedRooms === 2) return 1; // Tensión estancada
      if (this.completedRooms === 3) return 2;
      return 3;
    }
  }
}
