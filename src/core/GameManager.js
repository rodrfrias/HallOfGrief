export class GameManager {
  constructor() {
    // IDs de las habitaciones que instanciará main.js
    this.availableRooms = [
      "Denial",
      // 'Anger',
      // 'Bargaining',
      // 'Depression',
      // 'Acceptance'
    ];
    this.completedRooms = 0;

    // Mezclador para que el orden cambie en cada partida
    for (let i = this.availableRooms.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.availableRooms[i], this.availableRooms[j]] = [
        this.availableRooms[j],
        this.availableRooms[i],
      ];
    }
  }

  getNextRoom() {
    // Si ya completó 3 habitaciones, forzamos la de Aceptación
    if (
      this.completedRooms >= 3 &&
      !this.availableRooms.includes("Acceptance")
    ) {
      return "Acceptance";
    }

    if (this.availableRooms.length === 0) {
      return null;
    }
    return this.availableRooms.pop();
  }

  markRoomCompleted() {
    this.completedRooms++;
    // Retorna true si es hora de pasar a Aceptación
    return this.completedRooms >= 3;
  }
}
