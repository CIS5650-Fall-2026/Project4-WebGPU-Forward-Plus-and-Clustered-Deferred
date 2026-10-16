export const cpuTimer = {
    maxFrames: 120, 
    frameTimes: [] as number[],
    startTime: 0,

    begin() {
        this.startTime = performance.now();
    },
    end() {
        if (this.frameTimes.length < this.maxFrames) {
            this.frameTimes.push(performance.now() - this.startTime);
        }
    },
    reset() {
        this.frameTimes = [];
    }
};
