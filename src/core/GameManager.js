export class GameManager {
    constructor() {
        this.remainingStages = [
            'Denial',
            'Anger',
            'Bargaining',
            'Depression',
            'Acceptance'
        ];
    }

    getNextRoom() {
        if (this.remainingStages.length === 0) return null;

        const randomIndex = Math.floor(Math.random() * this.remainingStages.length);
        const [nextRoom] = this.remainingStages.splice(randomIndex, 1);
        return nextRoom;
    }
}