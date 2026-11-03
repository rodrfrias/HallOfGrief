export class GameManager {
    constructor() {
        // IDs de las habitaciones que instanciará main.js
        this.availableRooms = [
            'Denial',
            'Anger',
            'Bargaining',
            'Depression',
            'Acceptance'
        ];
        
        // Mezclador para que el orden cambie en cada partida
        for (let i = this.availableRooms.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.availableRooms[i], this.availableRooms[j]] = [this.availableRooms[j], this.availableRooms[i]];
        }
    }

    getNextRoom() {
        if (this.availableRooms.length === 0) {
            return null; // Ya recorrió todas las etapas
        }
        // Saca la última habitación del array ya mezclado y la devuelve
        return this.availableRooms.pop();
    }
}