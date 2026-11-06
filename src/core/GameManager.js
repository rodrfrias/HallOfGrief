export class GameManager {
    constructor() {
        // Todas las salas menos Aceptación
        this.availableRooms = [
            // 'Denial',
            // 'Anger',
            'Bargaining',
            // 'Depression'
        ];
        
        this.completedRooms = 0;
        this.acceptanceAdded = false;

        // Define si el viaje dura 4 o 5 habitaciones en total
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
        // Define cuando podemos llegar a la aceptación
        // Si el viaje es de 4 salas, la metemos luego de 2 completadas (quedan 2 en la bolsa)
        // Si el viaje es de 5 salas, la metemos luego de 3 completadas (quedan 2 en la bolsa)
        const threshold = this.targetRoomCount === 4 ? 2 : 3;

        if (this.completedRooms >= threshold && !this.acceptanceAdded) {
            this.availableRooms.push('Acceptance');
            this.shuffleArray(this.availableRooms);
            this.acceptanceAdded = true;
        }

        if (this.availableRooms.length === 0) {
            return null;
        }

        return this.availableRooms.pop();
    }

    markRoomCompleted() {
        this.completedRooms++;
        // Devuelve true solo si terminamos el viaje completo (llegamos al final del juego)
        return this.completedRooms >= this.targetRoomCount;
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