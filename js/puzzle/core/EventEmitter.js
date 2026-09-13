// ！拼图内部事件系统
// 零依赖事件发射器，每个 Puzzle 实例独立持有，不依赖全局 EventBus。
// 提供 on/off/emit/once：逐个 try-catch，确保一个回调报错不影响其他回调执行。
export class EventEmitter {
    constructor() {
        this._events = {};
    }

    // 登记事件
    on(eventName, callback) {
        if (!this._events[eventName]) this._events[eventName] = [];
        this._events[eventName].push(callback);
        return this;
    }

    // 取消登记事件
    // 未传 callback 时删除整个事件的所有回调，传了则只摘除指定回调
    off(eventName, callback) {
        if (!this._events[eventName]) return this;
        if (callback) {
            this._events[eventName] = this._events[eventName].filter(cb => cb !== callback);
        } else {
            delete this._events[eventName];
        }
        return this;
    }

    emit(eventName, data) {
        if (!this._events[eventName]) return;
        this._events[eventName].forEach(cb => {
            try { cb(data); } catch (e) { console.error('[Puzzle:EventEmitter]', eventName, e); }
        });
    }

    once(eventName, callback) {
        const wrapper = (data) => { callback(data); this.off(eventName, wrapper); };
        this.on(eventName, wrapper);
        return this;
    }

    // 清空全部登记
    destroy() {
        this._events = {};
    }
}
