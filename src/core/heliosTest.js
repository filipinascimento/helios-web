import * as d3 from "../../web_modules/d3.js"
import * as glmatrix from "../../web_modules/gl-matrix.js"


export class CVec{
    constructor(x,y,z){ 
        this.x = x; 
        this.y = y; 
        this.z = z; 
    }

    add(v2){
      this.x+=v2.x;
      this.y+=v2.y;
      this.z+=v2.z;
    }

    normalize(){
      let xx = this.x*this.x; 
      let yy = this.y*this.y;
      let zz = this.z*this.z;
      let invnorm = 1.0/Math.sqrt(xx+yy+zz);
      this.x*=invnorm;
      this.y*=invnorm;
      this.z*=invnorm;
    }
    cross(v2){
      let ax = this.x, ay = this.y, az = this.z;
      let bx = v2.x, by = v2.y, bz = v2.z;
      this.x = ay * bz - az * by;
      this.y = az * bx - ax * bz;
      this.z = ax * by - ay * bx;
    }

}