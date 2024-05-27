import './App.css'

import { Component, ReactNode, RefObject, createRef } from "react";

const vscode = acquireVsCodeApi();


class App extends Component {
    state = {sliceId: 0, slices: []};
    cachedImgs: {[id: number] : ImageData} = {};
    canvas: RefObject<HTMLCanvasElement>;

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
        const imageData = this.cachedImgs[this.state.slices[this.state.sliceId]];
        if(imageData) {
            this.canvas.current?.setAttribute("width", imageData.width.toString());
            this.canvas.current?.setAttribute("height", imageData.height.toString());
            this.canvas.current?.getContext("2d")?.putImageData(imageData, 0, 0);
        };
    }
    //@ts-ignore
    async onSlide(e){
        this.setState({sliceId: parseInt(e.nativeEvent.srcElement.value)});
    }
    //@ts-ignore
    async onWheel(e){
        this.setState({sliceId: Math.min(Math.max(this.state.sliceId + Math.sign(e.deltaY), 0), this.state.slices.length - 1)});
    }
    
    //@ts-ignore
    async handleMessage(e){
        switch(e.data.msg){
            case "array":
                const [id, [w,h,c], arr] = e.data.array;
                this.cachedImgs[id] = new ImageData(arr, h, w);
                console.log(`got ${id}`)
                break;
            case "url":
                break;
            case "ids":
                this.setState({sliceId: Math.floor(e.data.ids.length / 2), slices: e.data.ids});
                break;
            
        }
    }
    componentDidUpdate(prevProps: Readonly<{}>, prevState: Readonly<{}>, snapshot?: any): void {
        this.redrawCanvas();
    }
    componentDidMount() {
        window.addEventListener('message', this.handleMessage.bind(this));
        vscode.postMessage({msg: "ready"});
    }
    componentWillUnmount() {
        window.removeEventListener('message', this.handleMessage.bind(this));
    }
}

export default App;