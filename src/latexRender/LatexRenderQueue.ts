import async from 'async';
import { LatexTask } from './task/latexTask';
import { withTimeout } from './swiftlatexRender';
import { CssClasses } from 'src/util/cssClassesConstants';

export type QueueRenderer = {
    renderTask(task: LatexTask): Promise<boolean>;
    getCooldown(): number;
};

type InternalTask<T> = {
    data: T;
    callback: Function;
    next: InternalTask<T> | null;
};

type QueueObject<T> = async.QueueObject<T> & {
    _tasks: {
        head: InternalTask<T> | null;
        tail: InternalTask<T> | null;
        length: number;
        remove: (testFn: (node: InternalTask<T>) => boolean) => void;
    };
};


export class LatexRenderQueue {

    private queue: QueueObject<LatexTask>;
    private currentTask: LatexTask | null = null;

    constructor(private renderer: QueueRenderer) {
        this.configQueue();
    }

    push(task: LatexTask) {
        const blockId = task.getBlockId();
        console.log('Removing existing tasks with blockId:', blockId);
        this.queue.remove((node) => node.data.getBlockId() === blockId);
        task.el.appendChild(createWaitingCountdown(this.queue.length()));
        this.queue.push(task);
        console.log(
            'Task added to queue:',
            task.getDebugInfo(),
            'Current queue length:',
            this.queue.length(),
        );
    }

    removeFromWaiting(filterFn: (task: LatexTask) => boolean) {
        this.queue.remove((node) => filterFn(node.data));
    }

    abortAllWaiting() {
        let node = this.queue._tasks.head;

        while (node) {
            node.data.el.innerHTML = '';
            node = node.next;
        }

        this.queue.kill();
    }

    rebuild() {
        this.abortAllWaiting();
        this.configQueue();
    }

    length() {
        return this.queue.length();
    }

    running() {
        return this.queue.running();
    }

    idle() {
        return this.queue.idle();
    }

    getWaitingTasks(): LatexTask[] {
        const tasks: LatexTask[] = [];

        let node = this.queue._tasks.head;

        while (node) {
            tasks.push(node.data);
            node = node.next;
        }

        return tasks;
    }

    getSnapshot() {
        return {
            currentTask: this.currentTask,
            waiting: this.getWaitingTasks(),
            running: this.running(),
            length: this.length(),
            idle: this.idle(),
        };
    }

    configQueue() {
        this.queue = async.queue((task: LatexTask, done) => {
            this.currentTask = task;
            (async () => {
                console.log('Starting task:', task.getDebugInfo());
                const didRender = await this.renderer.renderTask(task);
                updateQueueCountdown(this.queue);

                if (didRender) {
                    setTimeout(() => { this.currentTask = null; done(); }, this.renderer.getCooldown());
                } else {
                    this.currentTask = null;
                    done();
                }
            })().catch((err) => {
                console.error(
                    'Queue worker crashed:',
                    err,
                    task.getDebugInfo(),
                );
                this.currentTask = null;
                done();
            });
        }, 1) as QueueObject<LatexTask>; // Concurrency is set to 1, so tasks run one at a time
    }
}


const updateQueueCountdown = (queue: QueueObject<LatexTask>) => {
    let taskNode = queue._tasks.head;
    let index = 0;
    while (taskNode) {
        const task = taskNode.data;
        const countdown = task.el.querySelector(
            '.' + CssClasses.loader.renderCountdown,
        );
        if (countdown) countdown.textContent = index.toString();
        else console.warn(`Countdown not found for task ${index}`);
        taskNode = taskNode.next;
        index++;
    }
};

function createWaitingCountdown(index: number) {
    const parentContainer = Object.assign(document.createElement('div'), {
        className: CssClasses.loader.loaderParentContainer,
    });

    const loader = Object.assign(document.createElement('div'), {
        className: CssClasses.loader.renderLoader,
    });

    const countdown = Object.assign(document.createElement('div'), {
        className: CssClasses.loader.renderCountdown,
        textContent: index.toString(),
    });
    parentContainer.appendChild(loader);
    parentContainer.appendChild(countdown);
    return parentContainer;
}