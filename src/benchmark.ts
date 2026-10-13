
export type BenchmarkMode =
    | 'naive'
    | 'forward+'
    | 'clustered deferred';

export interface BenchmarkResult {
    renderer: BenchmarkMode;
    numLights: number;
    sampleIndex: number;
    gpuTimeMs: number;
}

export interface BenchmarkSummary {
    renderer: BenchmarkMode;
    numLights: number;
    samples: number;
    meanMs: number;
    medianMs: number;
    stdDevMs: number;
    minMs: number;
    maxMs: number;
}

export class BenchmarkCollector {

    private readonly warmupSamples = 30;
    private readonly targetSamples = 100;





    private warmupCount = 0;
    private results: BenchmarkResult[] = [];
    private active = false;

    private sessionId = 0;




    private mode: BenchmarkMode = 'naive';
    private numLights = 500;


    onStop: (() => void) | null = null;





    start(mode: BenchmarkMode, numLights: number): void {
        this.sessionId++;
        this.mode = mode;
        this.numLights = numLights;



        this.warmupCount = 0;
        this.results = [];
        this.active = true;


        

        console.log(
            `Benchmark started: ${mode}, ${numLights} lights`
        );

    }

    record(milliseconds: number): void {
        
        
        if (!this.active) {
            return;
        }




        if (!Number.isFinite(milliseconds) || milliseconds < 0) {
            console.warn('Ignoring invalid GPU timing sample');
            return;
        }




        if (this.warmupCount < this.warmupSamples) {
            this.warmupCount++;

            if (this.warmupCount % 10 === 0) {
                console.log(`Benchmark warmup: ${this.warmupCount}/${this.warmupSamples}`);
            }


            return;
        }





        this.results.push({
            renderer: this.mode,
            numLights: this.numLights,
            sampleIndex: this.results.length + 1,
            gpuTimeMs: milliseconds
        });


        if (this.results.length % 10 === 0) {
            console.log(`Benchmark progress: ${this.results.length}/${this.targetSamples} recorded samples`);
        }

        if (this.results.length >= this.targetSamples) {
            this.active = false;
            this.finish();
        }
    }


    isActive(): boolean {
        return this.active;
    }

    getSessionId(): number {
        return this.sessionId;
    }


    recordForSession(milliseconds: number, sessionId: number, mode: BenchmarkMode): void {
        if (!this.active || sessionId !== this.sessionId || mode !== this.mode) {
            return;
        }


        this.record(milliseconds);
    }


    cancel(): void {
        if (!this.active) {
            return;
        }

        this.sessionId++;


        this.active = false;
        this.warmupCount = 0;
        this.results = [];

        this.onStop?.();


        console.warn('Benchmark canceled since configuration changed..');
    }




    private finish(): void {
        const times = this.results.map(
            result => result.gpuTimeMs
        );




        const sorted = [...times].sort((a, b) => a - b);

        const mean = times.reduce((sum, value) => sum + value, 0) / times.length;

        const median = (sorted[49] + sorted[50]) / 2;

        const variance = times.reduce((sum, value) => sum + (value - mean) ** 2, 0) / times.length;



        const summary: BenchmarkSummary = {
            renderer: this.mode,
            numLights: this.numLights,
            samples: times.length,
            meanMs: mean,
            medianMs: median,
            stdDevMs: Math.sqrt(variance),
            minMs: sorted[0],
            maxMs: sorted[sorted.length - 1]
        };





        console.table(summary);

        console.log(`Benchmark complete: ${this.mode}, ` + `${this.numLights} lights`);



        this.downloadCSV();

        this.onStop?.();
    }





    private downloadCSV(): void {
        const header = 'renderer,numLights,sampleIndex,gpuTimeMs';




        const rows = this.results.map(result =>
            [
                result.renderer,
                result.numLights,
                result.sampleIndex,
                result.gpuTimeMs.toFixed(6)
            ].join(',')
        );



        const csv = [header, ...rows].join('\n');




        const blob = new Blob([csv], {
            type: 'text/csv;charset=utf-8'
        });




        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = `gpu_${this.mode.replaceAll(' ', '_').replaceAll('+', 'plus')}_${this.numLights}_lights.csv`;



        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
    }
}




export const benchmarkCollector = new BenchmarkCollector();
