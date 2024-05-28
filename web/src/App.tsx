import './App.css'

import { Component, ReactNode, RefObject, createRef } from "react";

const vscode = acquireVsCodeApi();


class App extends Component {
    state = {sliceId: 0, slices: [], cachedImgs: Array<any>, t: 0};
    canvas: RefObject<HTMLCanvasElement>;
    interval: any;

    constructor(props: {}) {
        super(props);
        // create a ref to store the textInput DOM element
        this.canvas = createRef();
    }

    render(): ReactNode {
        return (
            <div id="main">
                <div id="view" className="center">
                    <div id="canvasDiv">
                        <canvas className='center' id="canvas" width={512} height={512} ref={this.canvas} onWheel={this.onWheel.bind(this)}/>
                    </div>
                    <div>
                        <input id="slider" type="range" max={this.state.slices.length} width="100%" value={this.state.sliceId} onChange={this.onSlide.bind(this)}/>
                    </div>
                </div>
            </div>
          );
    }

    async redrawCanvas(){
        const cached = this.state.cachedImgs[this.state.slices[this.state.sliceId]];
        if(cached) {
            //@ts-ignore
            const [id, [w,h,c], arr] = cached;
            const imageData = new ImageData(arr, h, w);
            this.canvas.current?.setAttribute("width", imageData.width.toString());
            this.canvas.current?.setAttribute("height", imageData.height.toString());
            this.canvas.current?.getContext("2d")?.putImageData(imageData, 0, 0);
        };
    }
    //@ts-ignore
    async onSlide(e){
        this.setState({...this.state, sliceId: parseInt(e.nativeEvent.srcElement.value)});
    }
    //@ts-ignore
    async onWheel(e){
        this.setState({...this.state, sliceId: Math.min(Math.max(this.state.sliceId + Math.sign(e.deltaY), 0), this.state.slices.length - 1)});
    }
    
    //@ts-ignore
    async handleMessage(e){
        switch(e.data.msg){
            case "array":
                const id = e.data.array[0];
                //@ts-ignore
                this.state.cachedImgs[id] = e.data.array;
                this.setState({...this.state, cachedImgs: this.state.cachedImgs})
                break;
            case "ids":
                this.setState({...this.state, sliceId: Math.floor(e.data.ids.length / 2), slices: e.data.ids});
                break;
            default:
                break;
            
        }
    }
    componentDidUpdate(prevProps: Readonly<{}>, prevState: Readonly<{}>, snapshot?: any): void {
        this.redrawCanvas();
    }
    componentDidMount() {
        const state = vscode.getState();
        if(state){
            console.log(state)
            this.setState(state);
        }
        window.addEventListener('message', this.handleMessage.bind(this));
        vscode.postMessage({msg: "ready"});
        this.interval = setInterval(() => {
            this.setState({...this.state, t: (this.state.t + 1) % 1000});
            // console.log(this.state)
            vscode.setState(this.state);
    }, 500)
    }
    componentWillUnmount() {
        window.removeEventListener('message', this.handleMessage.bind(this));
        clearInterval(this.interval);
    }
}

export default App;