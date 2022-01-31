var __create = Object.create;
var __defProp = Object.defineProperty;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __markAsModule = (target) => __defProp(target, "__esModule", {value: true});
var __commonJS = (callback, module) => () => {
  if (!module) {
    module = {exports: {}};
    callback(module.exports, module);
  }
  return module.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {get: all[name], enumerable: true});
};
var __exportStar = (target, module, desc) => {
  if (module && typeof module === "object" || typeof module === "function") {
    for (let key of __getOwnPropNames(module))
      if (!__hasOwnProp.call(target, key) && key !== "default")
        __defProp(target, key, {get: () => module[key], enumerable: !(desc = __getOwnPropDesc(module, key)) || desc.enumerable});
  }
  return target;
};
var __toModule = (module) => {
  return __exportStar(__markAsModule(__defProp(module != null ? __create(__getProtoOf(module)) : {}, "default", module && module.__esModule && "default" in module ? {get: () => module.default, enumerable: true} : {value: module, enumerable: true})), module);
};

// build/src/layouts/d3force3dLayoutWorker.js
var require_d3force3dLayoutWorker = __commonJS((exports, module) => {
  __markAsModule(exports);
  __export(exports, {
    layoutWorker: () => d3ForceLayoutWorker2
  });
  var workerFunction = function() {
    var require2 = function(moduleName) {
    };
    !function(n, e) {
      typeof exports == "object" && typeof module != "undefined" ? e(exports) : typeof define == "function" && define.amd ? define(["exports"], e) : e((n = typeof globalThis != "undefined" ? globalThis : n || self).d3 = n.d3 || {});
    }(this, function(n) {
      "use strict";
      var e = {value: () => {
      }};
      function t() {
        for (var n2, e2 = 0, t2 = arguments.length, o2 = {}; e2 < t2; ++e2) {
          if (!(n2 = arguments[e2] + "") || n2 in o2 || /[\s.]/.test(n2))
            throw new Error("illegal type: " + n2);
          o2[n2] = [];
        }
        return new r(o2);
      }
      function r(n2) {
        this._ = n2;
      }
      function o(n2, e2) {
        return n2.trim().split(/^|\s+/).map(function(n3) {
          var t2 = "", r2 = n3.indexOf(".");
          if (r2 >= 0 && (t2 = n3.slice(r2 + 1), n3 = n3.slice(0, r2)), n3 && !e2.hasOwnProperty(n3))
            throw new Error("unknown type: " + n3);
          return {type: n3, name: t2};
        });
      }
      function i(n2, e2) {
        for (var t2, r2 = 0, o2 = n2.length; r2 < o2; ++r2)
          if ((t2 = n2[r2]).name === e2)
            return t2.value;
      }
      function f(n2, t2, r2) {
        for (var o2 = 0, i2 = n2.length; o2 < i2; ++o2)
          if (n2[o2].name === t2) {
            n2[o2] = e, n2 = n2.slice(0, o2).concat(n2.slice(o2 + 1));
            break;
          }
        return r2 != null && n2.push({name: t2, value: r2}), n2;
      }
      r.prototype = t.prototype = {constructor: r, on: function(n2, e2) {
        var t2, r2 = this._, l = o(n2 + "", r2), a = -1, u = l.length;
        if (!(arguments.length < 2)) {
          if (e2 != null && typeof e2 != "function")
            throw new Error("invalid callback: " + e2);
          for (; ++a < u; )
            if (t2 = (n2 = l[a]).type)
              r2[t2] = f(r2[t2], n2.name, e2);
            else if (e2 == null)
              for (t2 in r2)
                r2[t2] = f(r2[t2], n2.name, null);
          return this;
        }
        for (; ++a < u; )
          if ((t2 = (n2 = l[a]).type) && (t2 = i(r2[t2], n2.name)))
            return t2;
      }, copy: function() {
        var n2 = {}, e2 = this._;
        for (var t2 in e2)
          n2[t2] = e2[t2].slice();
        return new r(n2);
      }, call: function(n2, e2) {
        if ((t2 = arguments.length - 2) > 0)
          for (var t2, r2, o2 = new Array(t2), i2 = 0; i2 < t2; ++i2)
            o2[i2] = arguments[i2 + 2];
        if (!this._.hasOwnProperty(n2))
          throw new Error("unknown type: " + n2);
        for (i2 = 0, t2 = (r2 = this._[n2]).length; i2 < t2; ++i2)
          r2[i2].value.apply(e2, o2);
      }, apply: function(n2, e2, t2) {
        if (!this._.hasOwnProperty(n2))
          throw new Error("unknown type: " + n2);
        for (var r2 = this._[n2], o2 = 0, i2 = r2.length; o2 < i2; ++o2)
          r2[o2].value.apply(e2, t2);
      }}, n.dispatch = t, Object.defineProperty(n, "__esModule", {value: true});
    });
    !function(t, i) {
      typeof exports == "object" && typeof module != "undefined" ? i(exports) : typeof define == "function" && define.amd ? define(["exports"], i) : i((t = typeof globalThis != "undefined" ? globalThis : t || self).d3 = t.d3 || {});
    }(this, function(t) {
      "use strict";
      function i(t2, i2, e2, n2) {
        if (isNaN(i2) || isNaN(e2))
          return t2;
        var r2, s2, h2, o2, a2, u, l, _, f, c = t2._root, x = {data: n2}, y = t2._x0, d = t2._y0, p = t2._x1, v = t2._y1;
        if (!c)
          return t2._root = x, t2;
        for (; c.length; )
          if ((u = i2 >= (s2 = (y + p) / 2)) ? y = s2 : p = s2, (l = e2 >= (h2 = (d + v) / 2)) ? d = h2 : v = h2, r2 = c, !(c = c[_ = l << 1 | u]))
            return r2[_] = x, t2;
        if (o2 = +t2._x.call(null, c.data), a2 = +t2._y.call(null, c.data), i2 === o2 && e2 === a2)
          return x.next = c, r2 ? r2[_] = x : t2._root = x, t2;
        do {
          r2 = r2 ? r2[_] = new Array(4) : t2._root = new Array(4), (u = i2 >= (s2 = (y + p) / 2)) ? y = s2 : p = s2, (l = e2 >= (h2 = (d + v) / 2)) ? d = h2 : v = h2;
        } while ((_ = l << 1 | u) == (f = (a2 >= h2) << 1 | o2 >= s2));
        return r2[f] = c, r2[_] = x, t2;
      }
      function e(t2, i2, e2, n2, r2) {
        this.node = t2, this.x0 = i2, this.y0 = e2, this.x1 = n2, this.y1 = r2;
      }
      function n(t2) {
        return t2[0];
      }
      function r(t2) {
        return t2[1];
      }
      function s(t2, i2, e2) {
        var s2 = new h(i2 == null ? n : i2, e2 == null ? r : e2, NaN, NaN, NaN, NaN);
        return t2 == null ? s2 : s2.addAll(t2);
      }
      function h(t2, i2, e2, n2, r2, s2) {
        this._x = t2, this._y = i2, this._x0 = e2, this._y0 = n2, this._x1 = r2, this._y1 = s2, this._root = void 0;
      }
      function o(t2) {
        for (var i2 = {data: t2.data}, e2 = i2; t2 = t2.next; )
          e2 = e2.next = {data: t2.data};
        return i2;
      }
      var a = s.prototype = h.prototype;
      a.copy = function() {
        var t2, i2, e2 = new h(this._x, this._y, this._x0, this._y0, this._x1, this._y1), n2 = this._root;
        if (!n2)
          return e2;
        if (!n2.length)
          return e2._root = o(n2), e2;
        for (t2 = [{source: n2, target: e2._root = new Array(4)}]; n2 = t2.pop(); )
          for (var r2 = 0; r2 < 4; ++r2)
            (i2 = n2.source[r2]) && (i2.length ? t2.push({source: i2, target: n2.target[r2] = new Array(4)}) : n2.target[r2] = o(i2));
        return e2;
      }, a.add = function(t2) {
        const e2 = +this._x.call(null, t2), n2 = +this._y.call(null, t2);
        return i(this.cover(e2, n2), e2, n2, t2);
      }, a.addAll = function(t2) {
        var e2, n2, r2, s2, h2 = t2.length, o2 = new Array(h2), a2 = new Array(h2), u = 1 / 0, l = 1 / 0, _ = -1 / 0, f = -1 / 0;
        for (n2 = 0; n2 < h2; ++n2)
          isNaN(r2 = +this._x.call(null, e2 = t2[n2])) || isNaN(s2 = +this._y.call(null, e2)) || (o2[n2] = r2, a2[n2] = s2, r2 < u && (u = r2), r2 > _ && (_ = r2), s2 < l && (l = s2), s2 > f && (f = s2));
        if (u > _ || l > f)
          return this;
        for (this.cover(u, l).cover(_, f), n2 = 0; n2 < h2; ++n2)
          i(this, o2[n2], a2[n2], t2[n2]);
        return this;
      }, a.cover = function(t2, i2) {
        if (isNaN(t2 = +t2) || isNaN(i2 = +i2))
          return this;
        var e2 = this._x0, n2 = this._y0, r2 = this._x1, s2 = this._y1;
        if (isNaN(e2))
          r2 = (e2 = Math.floor(t2)) + 1, s2 = (n2 = Math.floor(i2)) + 1;
        else {
          for (var h2, o2, a2 = r2 - e2 || 1, u = this._root; e2 > t2 || t2 >= r2 || n2 > i2 || i2 >= s2; )
            switch (o2 = (i2 < n2) << 1 | t2 < e2, (h2 = new Array(4))[o2] = u, u = h2, a2 *= 2, o2) {
              case 0:
                r2 = e2 + a2, s2 = n2 + a2;
                break;
              case 1:
                e2 = r2 - a2, s2 = n2 + a2;
                break;
              case 2:
                r2 = e2 + a2, n2 = s2 - a2;
                break;
              case 3:
                e2 = r2 - a2, n2 = s2 - a2;
            }
          this._root && this._root.length && (this._root = u);
        }
        return this._x0 = e2, this._y0 = n2, this._x1 = r2, this._y1 = s2, this;
      }, a.data = function() {
        var t2 = [];
        return this.visit(function(i2) {
          if (!i2.length)
            do {
              t2.push(i2.data);
            } while (i2 = i2.next);
        }), t2;
      }, a.extent = function(t2) {
        return arguments.length ? this.cover(+t2[0][0], +t2[0][1]).cover(+t2[1][0], +t2[1][1]) : isNaN(this._x0) ? void 0 : [[this._x0, this._y0], [this._x1, this._y1]];
      }, a.find = function(t2, i2, n2) {
        var r2, s2, h2, o2, a2, u, l, _ = this._x0, f = this._y0, c = this._x1, x = this._y1, y = [], d = this._root;
        for (d && y.push(new e(d, _, f, c, x)), n2 == null ? n2 = 1 / 0 : (_ = t2 - n2, f = i2 - n2, c = t2 + n2, x = i2 + n2, n2 *= n2); u = y.pop(); )
          if (!(!(d = u.node) || (s2 = u.x0) > c || (h2 = u.y0) > x || (o2 = u.x1) < _ || (a2 = u.y1) < f))
            if (d.length) {
              var p = (s2 + o2) / 2, v = (h2 + a2) / 2;
              y.push(new e(d[3], p, v, o2, a2), new e(d[2], s2, v, p, a2), new e(d[1], p, h2, o2, v), new e(d[0], s2, h2, p, v)), (l = (i2 >= v) << 1 | t2 >= p) && (u = y[y.length - 1], y[y.length - 1] = y[y.length - 1 - l], y[y.length - 1 - l] = u);
            } else {
              var w = t2 - +this._x.call(null, d.data), N = i2 - +this._y.call(null, d.data), g = w * w + N * N;
              if (g < n2) {
                var A = Math.sqrt(n2 = g);
                _ = t2 - A, f = i2 - A, c = t2 + A, x = i2 + A, r2 = d.data;
              }
            }
        return r2;
      }, a.remove = function(t2) {
        if (isNaN(s2 = +this._x.call(null, t2)) || isNaN(h2 = +this._y.call(null, t2)))
          return this;
        var i2, e2, n2, r2, s2, h2, o2, a2, u, l, _, f, c = this._root, x = this._x0, y = this._y0, d = this._x1, p = this._y1;
        if (!c)
          return this;
        if (c.length)
          for (; ; ) {
            if ((u = s2 >= (o2 = (x + d) / 2)) ? x = o2 : d = o2, (l = h2 >= (a2 = (y + p) / 2)) ? y = a2 : p = a2, i2 = c, !(c = c[_ = l << 1 | u]))
              return this;
            if (!c.length)
              break;
            (i2[_ + 1 & 3] || i2[_ + 2 & 3] || i2[_ + 3 & 3]) && (e2 = i2, f = _);
          }
        for (; c.data !== t2; )
          if (n2 = c, !(c = c.next))
            return this;
        return (r2 = c.next) && delete c.next, n2 ? (r2 ? n2.next = r2 : delete n2.next, this) : i2 ? (r2 ? i2[_] = r2 : delete i2[_], (c = i2[0] || i2[1] || i2[2] || i2[3]) && c === (i2[3] || i2[2] || i2[1] || i2[0]) && !c.length && (e2 ? e2[f] = c : this._root = c), this) : (this._root = r2, this);
      }, a.removeAll = function(t2) {
        for (var i2 = 0, e2 = t2.length; i2 < e2; ++i2)
          this.remove(t2[i2]);
        return this;
      }, a.root = function() {
        return this._root;
      }, a.size = function() {
        var t2 = 0;
        return this.visit(function(i2) {
          if (!i2.length)
            do {
              ++t2;
            } while (i2 = i2.next);
        }), t2;
      }, a.visit = function(t2) {
        var i2, n2, r2, s2, h2, o2, a2 = [], u = this._root;
        for (u && a2.push(new e(u, this._x0, this._y0, this._x1, this._y1)); i2 = a2.pop(); )
          if (!t2(u = i2.node, r2 = i2.x0, s2 = i2.y0, h2 = i2.x1, o2 = i2.y1) && u.length) {
            var l = (r2 + h2) / 2, _ = (s2 + o2) / 2;
            (n2 = u[3]) && a2.push(new e(n2, l, _, h2, o2)), (n2 = u[2]) && a2.push(new e(n2, r2, _, l, o2)), (n2 = u[1]) && a2.push(new e(n2, l, s2, h2, _)), (n2 = u[0]) && a2.push(new e(n2, r2, s2, l, _));
          }
        return this;
      }, a.visitAfter = function(t2) {
        var i2, n2 = [], r2 = [];
        for (this._root && n2.push(new e(this._root, this._x0, this._y0, this._x1, this._y1)); i2 = n2.pop(); ) {
          var s2 = i2.node;
          if (s2.length) {
            var h2, o2 = i2.x0, a2 = i2.y0, u = i2.x1, l = i2.y1, _ = (o2 + u) / 2, f = (a2 + l) / 2;
            (h2 = s2[0]) && n2.push(new e(h2, o2, a2, _, f)), (h2 = s2[1]) && n2.push(new e(h2, _, a2, u, f)), (h2 = s2[2]) && n2.push(new e(h2, o2, f, _, l)), (h2 = s2[3]) && n2.push(new e(h2, _, f, u, l));
          }
          r2.push(i2);
        }
        for (; i2 = r2.pop(); )
          t2(i2.node, i2.x0, i2.y0, i2.x1, i2.y1);
        return this;
      }, a.x = function(t2) {
        return arguments.length ? (this._x = t2, this) : this._x;
      }, a.y = function(t2) {
        return arguments.length ? (this._y = t2, this) : this._y;
      }, t.quadtree = s, Object.defineProperty(t, "__esModule", {value: true});
    });
    !function(t, n) {
      typeof exports == "object" && typeof module != "undefined" ? n(exports) : typeof define == "function" && define.amd ? define(["exports"], n) : n((t = typeof globalThis != "undefined" ? globalThis : t || self).d3 = t.d3 || {});
    }(this, function(t) {
      "use strict";
      var n, e, o = 0, i = 0, r = 0, l = 0, u = 0, a = 0, s = typeof performance == "object" && performance.now ? performance : Date, c = typeof window == "object" && window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function(t2) {
        setTimeout(t2, 17);
      };
      function f() {
        return u || (c(_), u = s.now() + a);
      }
      function _() {
        u = 0;
      }
      function m() {
        this._call = this._time = this._next = null;
      }
      function p(t2, n2, e2) {
        var o2 = new m();
        return o2.restart(t2, n2, e2), o2;
      }
      function w() {
        f(), ++o;
        for (var t2, e2 = n; e2; )
          (t2 = u - e2._time) >= 0 && e2._call.call(void 0, t2), e2 = e2._next;
        --o;
      }
      function d() {
        u = (l = s.now()) + a, o = i = 0;
        try {
          w();
        } finally {
          o = 0, function() {
            var t2, o2, i2 = n, r2 = 1 / 0;
            for (; i2; )
              i2._call ? (r2 > i2._time && (r2 = i2._time), t2 = i2, i2 = i2._next) : (o2 = i2._next, i2._next = null, i2 = t2 ? t2._next = o2 : n = o2);
            e = t2, y(r2);
          }(), u = 0;
        }
      }
      function h() {
        var t2 = s.now(), n2 = t2 - l;
        n2 > 1e3 && (a -= n2, l = t2);
      }
      function y(t2) {
        o || (i && (i = clearTimeout(i)), t2 - u > 24 ? (t2 < 1 / 0 && (i = setTimeout(d, t2 - s.now() - a)), r && (r = clearInterval(r))) : (r || (l = s.now(), r = setInterval(h, 1e3)), o = 1, c(d)));
      }
      m.prototype = p.prototype = {constructor: m, restart: function(t2, o2, i2) {
        if (typeof t2 != "function")
          throw new TypeError("callback is not a function");
        i2 = (i2 == null ? f() : +i2) + (o2 == null ? 0 : +o2), this._next || e === this || (e ? e._next = this : n = this, e = this), this._call = t2, this._time = i2, y();
      }, stop: function() {
        this._call && (this._call = null, this._time = 1 / 0, y());
      }}, t.interval = function(t2, n2, e2) {
        var o2 = new m(), i2 = n2;
        return n2 == null ? (o2.restart(t2, n2, e2), o2) : (o2._restart = o2.restart, o2.restart = function(t3, n3, e3) {
          n3 = +n3, e3 = e3 == null ? f() : +e3, o2._restart(function r2(l2) {
            l2 += i2, o2._restart(r2, i2 += n3, e3), t3(l2);
          }, n3, e3);
        }, o2.restart(t2, n2, e2), o2);
      }, t.now = f, t.timeout = function(t2, n2, e2) {
        var o2 = new m();
        return n2 = n2 == null ? 0 : +n2, o2.restart((e3) => {
          o2.stop(), t2(e3 + n2);
        }, n2, e2), o2;
      }, t.timer = p, t.timerFlush = w, Object.defineProperty(t, "__esModule", {value: true});
    });
    !function(n, t) {
      typeof exports == "object" && typeof module != "undefined" ? t(exports, require2("d3-quadtree"), require2("d3-dispatch"), require2("d3-timer")) : typeof define == "function" && define.amd ? define(["exports", "d3-quadtree", "d3-dispatch", "d3-timer"], t) : t((n = typeof globalThis != "undefined" ? globalThis : n || self).d3 = n.d3 || {}, n.d3, n.d3, n.d3);
    }(this, function(n, t, e, r) {
      "use strict";
      function i(n2) {
        return function() {
          return n2;
        };
      }
      function u(n2) {
        return 1e-6 * (n2() - 0.5);
      }
      function o(n2) {
        return n2.x + n2.vx;
      }
      function f(n2) {
        return n2.y + n2.vy;
      }
      function a(n2) {
        return n2.index;
      }
      function c(n2, t2) {
        var e2 = n2.get(t2);
        if (!e2)
          throw new Error("node not found: " + t2);
        return e2;
      }
      const l = 4294967296;
      function h(n2) {
        return n2.x;
      }
      function v(n2) {
        return n2.y;
      }
      var y = Math.PI * (3 - Math.sqrt(5));
      n.forceCenter = function(n2, t2) {
        var e2, r2 = 1;
        function i2() {
          var i3, u2, o2 = e2.length, f2 = 0, a2 = 0;
          for (i3 = 0; i3 < o2; ++i3)
            f2 += (u2 = e2[i3]).x, a2 += u2.y;
          for (f2 = (f2 / o2 - n2) * r2, a2 = (a2 / o2 - t2) * r2, i3 = 0; i3 < o2; ++i3)
            (u2 = e2[i3]).x -= f2, u2.y -= a2;
        }
        return n2 == null && (n2 = 0), t2 == null && (t2 = 0), i2.initialize = function(n3) {
          e2 = n3;
        }, i2.x = function(t3) {
          return arguments.length ? (n2 = +t3, i2) : n2;
        }, i2.y = function(n3) {
          return arguments.length ? (t2 = +n3, i2) : t2;
        }, i2.strength = function(n3) {
          return arguments.length ? (r2 = +n3, i2) : r2;
        }, i2;
      }, n.forceCollide = function(n2) {
        var e2, r2, a2, c2 = 1, l2 = 1;
        function h2() {
          for (var n3, i2, h3, y3, d, g, x, s = e2.length, p = 0; p < l2; ++p)
            for (i2 = t.quadtree(e2, o, f).visitAfter(v2), n3 = 0; n3 < s; ++n3)
              h3 = e2[n3], g = r2[h3.index], x = g * g, y3 = h3.x + h3.vx, d = h3.y + h3.vy, i2.visit(M);
          function M(n4, t2, e3, r3, i3) {
            var o2 = n4.data, f2 = n4.r, l3 = g + f2;
            if (!o2)
              return t2 > y3 + l3 || r3 < y3 - l3 || e3 > d + l3 || i3 < d - l3;
            if (o2.index > h3.index) {
              var v3 = y3 - o2.x - o2.vx, s2 = d - o2.y - o2.vy, p2 = v3 * v3 + s2 * s2;
              p2 < l3 * l3 && (v3 === 0 && (p2 += (v3 = u(a2)) * v3), s2 === 0 && (p2 += (s2 = u(a2)) * s2), p2 = (l3 - (p2 = Math.sqrt(p2))) / p2 * c2, h3.vx += (v3 *= p2) * (l3 = (f2 *= f2) / (x + f2)), h3.vy += (s2 *= p2) * l3, o2.vx -= v3 * (l3 = 1 - l3), o2.vy -= s2 * l3);
            }
          }
        }
        function v2(n3) {
          if (n3.data)
            return n3.r = r2[n3.data.index];
          for (var t2 = n3.r = 0; t2 < 4; ++t2)
            n3[t2] && n3[t2].r > n3.r && (n3.r = n3[t2].r);
        }
        function y2() {
          if (e2) {
            var t2, i2, u2 = e2.length;
            for (r2 = new Array(u2), t2 = 0; t2 < u2; ++t2)
              i2 = e2[t2], r2[i2.index] = +n2(i2, t2, e2);
          }
        }
        return typeof n2 != "function" && (n2 = i(n2 == null ? 1 : +n2)), h2.initialize = function(n3, t2) {
          e2 = n3, a2 = t2, y2();
        }, h2.iterations = function(n3) {
          return arguments.length ? (l2 = +n3, h2) : l2;
        }, h2.strength = function(n3) {
          return arguments.length ? (c2 = +n3, h2) : c2;
        }, h2.radius = function(t2) {
          return arguments.length ? (n2 = typeof t2 == "function" ? t2 : i(+t2), y2(), h2) : n2;
        }, h2;
      }, n.forceLink = function(n2) {
        var t2, e2, r2, o2, f2, l2, h2 = a, v2 = function(n3) {
          return 1 / Math.min(o2[n3.source.index], o2[n3.target.index]);
        }, y2 = i(30), d = 1;
        function g(r3) {
          for (var i2 = 0, o3 = n2.length; i2 < d; ++i2)
            for (var a2, c2, h3, v3, y3, g2, x2, s2 = 0; s2 < o3; ++s2)
              c2 = (a2 = n2[s2]).source, v3 = (h3 = a2.target).x + h3.vx - c2.x - c2.vx || u(l2), y3 = h3.y + h3.vy - c2.y - c2.vy || u(l2), v3 *= g2 = ((g2 = Math.sqrt(v3 * v3 + y3 * y3)) - e2[s2]) / g2 * r3 * t2[s2], y3 *= g2, h3.vx -= v3 * (x2 = f2[s2]), h3.vy -= y3 * x2, c2.vx += v3 * (x2 = 1 - x2), c2.vy += y3 * x2;
        }
        function x() {
          if (r2) {
            var i2, u2, a2 = r2.length, l3 = n2.length, v3 = new Map(r2.map((n3, t3) => [h2(n3, t3, r2), n3]));
            for (i2 = 0, o2 = new Array(a2); i2 < l3; ++i2)
              (u2 = n2[i2]).index = i2, typeof u2.source != "object" && (u2.source = c(v3, u2.source)), typeof u2.target != "object" && (u2.target = c(v3, u2.target)), o2[u2.source.index] = (o2[u2.source.index] || 0) + 1, o2[u2.target.index] = (o2[u2.target.index] || 0) + 1;
            for (i2 = 0, f2 = new Array(l3); i2 < l3; ++i2)
              u2 = n2[i2], f2[i2] = o2[u2.source.index] / (o2[u2.source.index] + o2[u2.target.index]);
            t2 = new Array(l3), s(), e2 = new Array(l3), p();
          }
        }
        function s() {
          if (r2)
            for (var e3 = 0, i2 = n2.length; e3 < i2; ++e3)
              t2[e3] = +v2(n2[e3], e3, n2);
        }
        function p() {
          if (r2)
            for (var t3 = 0, i2 = n2.length; t3 < i2; ++t3)
              e2[t3] = +y2(n2[t3], t3, n2);
        }
        return n2 == null && (n2 = []), g.initialize = function(n3, t3) {
          r2 = n3, l2 = t3, x();
        }, g.links = function(t3) {
          return arguments.length ? (n2 = t3, x(), g) : n2;
        }, g.id = function(n3) {
          return arguments.length ? (h2 = n3, g) : h2;
        }, g.iterations = function(n3) {
          return arguments.length ? (d = +n3, g) : d;
        }, g.strength = function(n3) {
          return arguments.length ? (v2 = typeof n3 == "function" ? n3 : i(+n3), s(), g) : v2;
        }, g.distance = function(n3) {
          return arguments.length ? (y2 = typeof n3 == "function" ? n3 : i(+n3), p(), g) : y2;
        }, g;
      }, n.forceManyBody = function() {
        var n2, e2, r2, o2, f2, a2 = i(-30), c2 = 1, l2 = 1 / 0, y2 = 0.81;
        function d(r3) {
          var i2, u2 = n2.length, f3 = t.quadtree(n2, h, v).visitAfter(x);
          for (o2 = r3, i2 = 0; i2 < u2; ++i2)
            e2 = n2[i2], f3.visit(s);
        }
        function g() {
          if (n2) {
            var t2, e3, r3 = n2.length;
            for (f2 = new Array(r3), t2 = 0; t2 < r3; ++t2)
              e3 = n2[t2], f2[e3.index] = +a2(e3, t2, n2);
          }
        }
        function x(n3) {
          var t2, e3, r3, i2, u2, o3 = 0, a3 = 0;
          if (n3.length) {
            for (r3 = i2 = u2 = 0; u2 < 4; ++u2)
              (t2 = n3[u2]) && (e3 = Math.abs(t2.value)) && (o3 += t2.value, a3 += e3, r3 += e3 * t2.x, i2 += e3 * t2.y);
            n3.x = r3 / a3, n3.y = i2 / a3;
          } else {
            (t2 = n3).x = t2.data.x, t2.y = t2.data.y;
            do {
              o3 += f2[t2.data.index];
            } while (t2 = t2.next);
          }
          n3.value = o3;
        }
        function s(n3, t2, i2, a3) {
          if (!n3.value)
            return true;
          var h2 = n3.x - e2.x, v2 = n3.y - e2.y, d2 = a3 - t2, g2 = h2 * h2 + v2 * v2;
          if (d2 * d2 / y2 < g2)
            return g2 < l2 && (h2 === 0 && (g2 += (h2 = u(r2)) * h2), v2 === 0 && (g2 += (v2 = u(r2)) * v2), g2 < c2 && (g2 = Math.sqrt(c2 * g2)), e2.vx += h2 * n3.value * o2 / g2, e2.vy += v2 * n3.value * o2 / g2), true;
          if (!(n3.length || g2 >= l2)) {
            (n3.data !== e2 || n3.next) && (h2 === 0 && (g2 += (h2 = u(r2)) * h2), v2 === 0 && (g2 += (v2 = u(r2)) * v2), g2 < c2 && (g2 = Math.sqrt(c2 * g2)));
            do {
              n3.data !== e2 && (d2 = f2[n3.data.index] * o2 / g2, e2.vx += h2 * d2, e2.vy += v2 * d2);
            } while (n3 = n3.next);
          }
        }
        return d.initialize = function(t2, e3) {
          n2 = t2, r2 = e3, g();
        }, d.strength = function(n3) {
          return arguments.length ? (a2 = typeof n3 == "function" ? n3 : i(+n3), g(), d) : a2;
        }, d.distanceMin = function(n3) {
          return arguments.length ? (c2 = n3 * n3, d) : Math.sqrt(c2);
        }, d.distanceMax = function(n3) {
          return arguments.length ? (l2 = n3 * n3, d) : Math.sqrt(l2);
        }, d.theta = function(n3) {
          return arguments.length ? (y2 = n3 * n3, d) : Math.sqrt(y2);
        }, d;
      }, n.forceRadial = function(n2, t2, e2) {
        var r2, u2, o2, f2 = i(0.1);
        function a2(n3) {
          for (var i2 = 0, f3 = r2.length; i2 < f3; ++i2) {
            var a3 = r2[i2], c3 = a3.x - t2 || 1e-6, l2 = a3.y - e2 || 1e-6, h2 = Math.sqrt(c3 * c3 + l2 * l2), v2 = (o2[i2] - h2) * u2[i2] * n3 / h2;
            a3.vx += c3 * v2, a3.vy += l2 * v2;
          }
        }
        function c2() {
          if (r2) {
            var t3, e3 = r2.length;
            for (u2 = new Array(e3), o2 = new Array(e3), t3 = 0; t3 < e3; ++t3)
              o2[t3] = +n2(r2[t3], t3, r2), u2[t3] = isNaN(o2[t3]) ? 0 : +f2(r2[t3], t3, r2);
          }
        }
        return typeof n2 != "function" && (n2 = i(+n2)), t2 == null && (t2 = 0), e2 == null && (e2 = 0), a2.initialize = function(n3) {
          r2 = n3, c2();
        }, a2.strength = function(n3) {
          return arguments.length ? (f2 = typeof n3 == "function" ? n3 : i(+n3), c2(), a2) : f2;
        }, a2.radius = function(t3) {
          return arguments.length ? (n2 = typeof t3 == "function" ? t3 : i(+t3), c2(), a2) : n2;
        }, a2.x = function(n3) {
          return arguments.length ? (t2 = +n3, a2) : t2;
        }, a2.y = function(n3) {
          return arguments.length ? (e2 = +n3, a2) : e2;
        }, a2;
      }, n.forceSimulation = function(n2) {
        var t2, i2 = 1, u2 = 1e-3, o2 = 1 - Math.pow(u2, 1 / 300), f2 = 0, a2 = 0.6, c2 = new Map(), h2 = r.timer(g), v2 = e.dispatch("tick", "end"), d = function() {
          let n3 = 1;
          return () => (n3 = (1664525 * n3 + 1013904223) % l) / l;
        }();
        function g() {
          x(), v2.call("tick", t2), i2 < u2 && (h2.stop(), v2.call("end", t2));
        }
        function x(e2) {
          var r2, u3, l2 = n2.length;
          e2 === void 0 && (e2 = 1);
          for (var h3 = 0; h3 < e2; ++h3)
            for (i2 += (f2 - i2) * o2, c2.forEach(function(n3) {
              n3(i2);
            }), r2 = 0; r2 < l2; ++r2)
              (u3 = n2[r2]).fx == null ? u3.x += u3.vx *= a2 : (u3.x = u3.fx, u3.vx = 0), u3.fy == null ? u3.y += u3.vy *= a2 : (u3.y = u3.fy, u3.vy = 0);
          return t2;
        }
        function s() {
          for (var t3, e2 = 0, r2 = n2.length; e2 < r2; ++e2) {
            if ((t3 = n2[e2]).index = e2, t3.fx != null && (t3.x = t3.fx), t3.fy != null && (t3.y = t3.fy), isNaN(t3.x) || isNaN(t3.y)) {
              var i3 = 10 * Math.sqrt(0.5 + e2), u3 = e2 * y;
              t3.x = i3 * Math.cos(u3), t3.y = i3 * Math.sin(u3);
            }
            (isNaN(t3.vx) || isNaN(t3.vy)) && (t3.vx = t3.vy = 0);
          }
        }
        function p(t3) {
          return t3.initialize && t3.initialize(n2, d), t3;
        }
        return n2 == null && (n2 = []), s(), t2 = {tick: x, restart: function() {
          return h2.restart(g), t2;
        }, stop: function() {
          return h2.stop(), t2;
        }, nodes: function(e2) {
          return arguments.length ? (n2 = e2, s(), c2.forEach(p), t2) : n2;
        }, alpha: function(n3) {
          return arguments.length ? (i2 = +n3, t2) : i2;
        }, alphaMin: function(n3) {
          return arguments.length ? (u2 = +n3, t2) : u2;
        }, alphaDecay: function(n3) {
          return arguments.length ? (o2 = +n3, t2) : +o2;
        }, alphaTarget: function(n3) {
          return arguments.length ? (f2 = +n3, t2) : f2;
        }, velocityDecay: function(n3) {
          return arguments.length ? (a2 = 1 - n3, t2) : 1 - a2;
        }, randomSource: function(n3) {
          return arguments.length ? (d = n3, c2.forEach(p), t2) : d;
        }, force: function(n3, e2) {
          return arguments.length > 1 ? (e2 == null ? c2.delete(n3) : c2.set(n3, p(e2)), t2) : c2.get(n3);
        }, find: function(t3, e2, r2) {
          var i3, u3, o3, f3, a3, c3 = 0, l2 = n2.length;
          for (r2 == null ? r2 = 1 / 0 : r2 *= r2, c3 = 0; c3 < l2; ++c3)
            (o3 = (i3 = t3 - (f3 = n2[c3]).x) * i3 + (u3 = e2 - f3.y) * u3) < r2 && (a3 = f3, r2 = o3);
          return a3;
        }, on: function(n3, e2) {
          return arguments.length > 1 ? (v2.on(n3, e2), t2) : v2.on(n3);
        }};
      }, n.forceX = function(n2) {
        var t2, e2, r2, u2 = i(0.1);
        function o2(n3) {
          for (var i2, u3 = 0, o3 = t2.length; u3 < o3; ++u3)
            (i2 = t2[u3]).vx += (r2[u3] - i2.x) * e2[u3] * n3;
        }
        function f2() {
          if (t2) {
            var i2, o3 = t2.length;
            for (e2 = new Array(o3), r2 = new Array(o3), i2 = 0; i2 < o3; ++i2)
              e2[i2] = isNaN(r2[i2] = +n2(t2[i2], i2, t2)) ? 0 : +u2(t2[i2], i2, t2);
          }
        }
        return typeof n2 != "function" && (n2 = i(n2 == null ? 0 : +n2)), o2.initialize = function(n3) {
          t2 = n3, f2();
        }, o2.strength = function(n3) {
          return arguments.length ? (u2 = typeof n3 == "function" ? n3 : i(+n3), f2(), o2) : u2;
        }, o2.x = function(t3) {
          return arguments.length ? (n2 = typeof t3 == "function" ? t3 : i(+t3), f2(), o2) : n2;
        }, o2;
      }, n.forceY = function(n2) {
        var t2, e2, r2, u2 = i(0.1);
        function o2(n3) {
          for (var i2, u3 = 0, o3 = t2.length; u3 < o3; ++u3)
            (i2 = t2[u3]).vy += (r2[u3] - i2.y) * e2[u3] * n3;
        }
        function f2() {
          if (t2) {
            var i2, o3 = t2.length;
            for (e2 = new Array(o3), r2 = new Array(o3), i2 = 0; i2 < o3; ++i2)
              e2[i2] = isNaN(r2[i2] = +n2(t2[i2], i2, t2)) ? 0 : +u2(t2[i2], i2, t2);
          }
        }
        return typeof n2 != "function" && (n2 = i(n2 == null ? 0 : +n2)), o2.initialize = function(n3) {
          t2 = n3, f2();
        }, o2.strength = function(n3) {
          return arguments.length ? (u2 = typeof n3 == "function" ? n3 : i(+n3), f2(), o2) : u2;
        }, o2.y = function(t3) {
          return arguments.length ? (n2 = typeof t3 == "function" ? t3 : i(+t3), f2(), o2) : n2;
        }, o2;
      }, Object.defineProperty(n, "__esModule", {value: true});
    });
    !function(t, r) {
      typeof exports == "object" && typeof module != "undefined" ? r(exports) : typeof define == "function" && define.amd ? define(["exports"], r) : r((t = typeof globalThis != "undefined" ? globalThis : t || self).d3 = t.d3 || {});
    }(this, function(t) {
      "use strict";
      function r(t2, r2, e2) {
        if (isNaN(r2))
          return t2;
        var n2, i2, o2, s2, h2, u, a = t2._root, f = {data: e2}, l = t2._x0, x = t2._x1;
        if (!a)
          return t2._root = f, t2;
        for (; a.length; )
          if ((s2 = r2 >= (i2 = (l + x) / 2)) ? l = i2 : x = i2, n2 = a, !(a = a[h2 = +s2]))
            return n2[h2] = f, t2;
        if (r2 === (o2 = +t2._x.call(null, a.data)))
          return f.next = a, n2 ? n2[h2] = f : t2._root = f, t2;
        do {
          n2 = n2 ? n2[h2] = new Array(2) : t2._root = new Array(2), (s2 = r2 >= (i2 = (l + x) / 2)) ? l = i2 : x = i2;
        } while ((h2 = +s2) == (u = +(o2 >= i2)));
        return n2[u] = a, n2[h2] = f, t2;
      }
      function e(t2, r2, e2) {
        this.node = t2, this.x0 = r2, this.x1 = e2;
      }
      function n(t2) {
        return t2[0];
      }
      function i(t2, r2) {
        var e2 = new o(r2 == null ? n : r2, NaN, NaN);
        return t2 == null ? e2 : e2.addAll(t2);
      }
      function o(t2, r2, e2) {
        this._x = t2, this._x0 = r2, this._x1 = e2, this._root = void 0;
      }
      function s(t2) {
        for (var r2 = {data: t2.data}, e2 = r2; t2 = t2.next; )
          e2 = e2.next = {data: t2.data};
        return r2;
      }
      var h = i.prototype = o.prototype;
      h.copy = function() {
        var t2, r2, e2 = new o(this._x, this._x0, this._x1), n2 = this._root;
        if (!n2)
          return e2;
        if (!n2.length)
          return e2._root = s(n2), e2;
        for (t2 = [{source: n2, target: e2._root = new Array(2)}]; n2 = t2.pop(); )
          for (var i2 = 0; i2 < 2; ++i2)
            (r2 = n2.source[i2]) && (r2.length ? t2.push({source: r2, target: n2.target[i2] = new Array(2)}) : n2.target[i2] = s(r2));
        return e2;
      }, h.add = function(t2) {
        var e2 = +this._x.call(null, t2);
        return r(this.cover(e2), e2, t2);
      }, h.addAll = function(t2) {
        var e2, n2, i2 = t2.length, o2 = new Array(i2), s2 = 1 / 0, h2 = -1 / 0;
        for (e2 = 0; e2 < i2; ++e2)
          isNaN(n2 = +this._x.call(null, t2[e2])) || (o2[e2] = n2, n2 < s2 && (s2 = n2), n2 > h2 && (h2 = n2));
        if (s2 > h2)
          return this;
        for (this.cover(s2).cover(h2), e2 = 0; e2 < i2; ++e2)
          r(this, o2[e2], t2[e2]);
        return this;
      }, h.cover = function(t2) {
        if (isNaN(t2 = +t2))
          return this;
        var r2 = this._x0, e2 = this._x1;
        if (isNaN(r2))
          e2 = (r2 = Math.floor(t2)) + 1;
        else {
          for (var n2, i2, o2 = e2 - r2 || 1, s2 = this._root; r2 > t2 || t2 >= e2; )
            switch (i2 = +(t2 < r2), (n2 = new Array(2))[i2] = s2, s2 = n2, o2 *= 2, i2) {
              case 0:
                e2 = r2 + o2;
                break;
              case 1:
                r2 = e2 - o2;
            }
          this._root && this._root.length && (this._root = s2);
        }
        return this._x0 = r2, this._x1 = e2, this;
      }, h.data = function() {
        var t2 = [];
        return this.visit(function(r2) {
          if (!r2.length)
            do {
              t2.push(r2.data);
            } while (r2 = r2.next);
        }), t2;
      }, h.extent = function(t2) {
        return arguments.length ? this.cover(+t2[0][0]).cover(+t2[1][0]) : isNaN(this._x0) ? void 0 : [[this._x0], [this._x1]];
      }, h.find = function(t2, r2) {
        var n2, i2, o2, s2, h2, u = this._x0, a = this._x1, f = [], l = this._root;
        for (l && f.push(new e(l, u, a)), r2 == null ? r2 = 1 / 0 : (u = t2 - r2, a = t2 + r2); s2 = f.pop(); )
          if (!(!(l = s2.node) || (i2 = s2.x0) > a || (o2 = s2.x1) < u))
            if (l.length) {
              var x = (i2 + o2) / 2;
              f.push(new e(l[1], x, o2), new e(l[0], i2, x)), (h2 = +(t2 >= x)) && (s2 = f[f.length - 1], f[f.length - 1] = f[f.length - 1 - h2], f[f.length - 1 - h2] = s2);
            } else {
              var _ = Math.abs(t2 - +this._x.call(null, l.data));
              _ < r2 && (r2 = _, u = t2 - _, a = t2 + _, n2 = l.data);
            }
        return n2;
      }, h.remove = function(t2) {
        if (isNaN(o2 = +this._x.call(null, t2)))
          return this;
        var r2, e2, n2, i2, o2, s2, h2, u, a, f = this._root, l = this._x0, x = this._x1;
        if (!f)
          return this;
        if (f.length)
          for (; ; ) {
            if ((h2 = o2 >= (s2 = (l + x) / 2)) ? l = s2 : x = s2, r2 = f, !(f = f[u = +h2]))
              return this;
            if (!f.length)
              break;
            r2[u + 1 & 1] && (e2 = r2, a = u);
          }
        for (; f.data !== t2; )
          if (n2 = f, !(f = f.next))
            return this;
        return (i2 = f.next) && delete f.next, n2 ? (i2 ? n2.next = i2 : delete n2.next, this) : r2 ? (i2 ? r2[u] = i2 : delete r2[u], (f = r2[0] || r2[1]) && f === (r2[1] || r2[0]) && !f.length && (e2 ? e2[a] = f : this._root = f), this) : (this._root = i2, this);
      }, h.removeAll = function(t2) {
        for (var r2 = 0, e2 = t2.length; r2 < e2; ++r2)
          this.remove(t2[r2]);
        return this;
      }, h.root = function() {
        return this._root;
      }, h.size = function() {
        var t2 = 0;
        return this.visit(function(r2) {
          if (!r2.length)
            do {
              ++t2;
            } while (r2 = r2.next);
        }), t2;
      }, h.visit = function(t2) {
        var r2, n2, i2, o2, s2 = [], h2 = this._root;
        for (h2 && s2.push(new e(h2, this._x0, this._x1)); r2 = s2.pop(); )
          if (!t2(h2 = r2.node, i2 = r2.x0, o2 = r2.x1) && h2.length) {
            var u = (i2 + o2) / 2;
            (n2 = h2[1]) && s2.push(new e(n2, u, o2)), (n2 = h2[0]) && s2.push(new e(n2, i2, u));
          }
        return this;
      }, h.visitAfter = function(t2) {
        var r2, n2 = [], i2 = [];
        for (this._root && n2.push(new e(this._root, this._x0, this._x1)); r2 = n2.pop(); ) {
          var o2 = r2.node;
          if (o2.length) {
            var s2, h2 = r2.x0, u = r2.x1, a = (h2 + u) / 2;
            (s2 = o2[0]) && n2.push(new e(s2, h2, a)), (s2 = o2[1]) && n2.push(new e(s2, a, u));
          }
          i2.push(r2);
        }
        for (; r2 = i2.pop(); )
          t2(r2.node, r2.x0, r2.x1);
        return this;
      }, h.x = function(t2) {
        return arguments.length ? (this._x = t2, this) : this._x;
      }, t.binarytree = i, Object.defineProperty(t, "__esModule", {value: true});
    });
    !function(t, i) {
      typeof exports == "object" && typeof module != "undefined" ? i(exports) : typeof define == "function" && define.amd ? define(["exports"], i) : i((t = typeof globalThis != "undefined" ? globalThis : t || self).d3 = t.d3 || {});
    }(this, function(t) {
      "use strict";
      function i(t2, i2, n2, e2, s2) {
        if (isNaN(i2) || isNaN(n2) || isNaN(e2))
          return t2;
        var h2, r2, o2, a2, l2, u, _, f, c, y, x, d, p = t2._root, w = {data: s2}, z = t2._x0, N = t2._y0, v = t2._z0, g = t2._x1, b = t2._y1, A = t2._z1;
        if (!p)
          return t2._root = w, t2;
        for (; p.length; )
          if ((f = i2 >= (r2 = (z + g) / 2)) ? z = r2 : g = r2, (c = n2 >= (o2 = (N + b) / 2)) ? N = o2 : b = o2, (y = e2 >= (a2 = (v + A) / 2)) ? v = a2 : A = a2, h2 = p, !(p = p[x = y << 2 | c << 1 | f]))
            return h2[x] = w, t2;
        if (l2 = +t2._x.call(null, p.data), u = +t2._y.call(null, p.data), _ = +t2._z.call(null, p.data), i2 === l2 && n2 === u && e2 === _)
          return w.next = p, h2 ? h2[x] = w : t2._root = w, t2;
        do {
          h2 = h2 ? h2[x] = new Array(8) : t2._root = new Array(8), (f = i2 >= (r2 = (z + g) / 2)) ? z = r2 : g = r2, (c = n2 >= (o2 = (N + b) / 2)) ? N = o2 : b = o2, (y = e2 >= (a2 = (v + A) / 2)) ? v = a2 : A = a2;
        } while ((x = y << 2 | c << 1 | f) == (d = (_ >= a2) << 2 | (u >= o2) << 1 | l2 >= r2));
        return h2[d] = p, h2[x] = w, t2;
      }
      function n(t2, i2, n2, e2, s2, h2, r2) {
        this.node = t2, this.x0 = i2, this.y0 = n2, this.z0 = e2, this.x1 = s2, this.y1 = h2, this.z1 = r2;
      }
      function e(t2) {
        return t2[0];
      }
      function s(t2) {
        return t2[1];
      }
      function h(t2) {
        return t2[2];
      }
      function r(t2, i2, n2, r2) {
        var a2 = new o(i2 == null ? e : i2, n2 == null ? s : n2, r2 == null ? h : r2, NaN, NaN, NaN, NaN, NaN, NaN);
        return t2 == null ? a2 : a2.addAll(t2);
      }
      function o(t2, i2, n2, e2, s2, h2, r2, o2, a2) {
        this._x = t2, this._y = i2, this._z = n2, this._x0 = e2, this._y0 = s2, this._z0 = h2, this._x1 = r2, this._y1 = o2, this._z1 = a2, this._root = void 0;
      }
      function a(t2) {
        for (var i2 = {data: t2.data}, n2 = i2; t2 = t2.next; )
          n2 = n2.next = {data: t2.data};
        return i2;
      }
      var l = r.prototype = o.prototype;
      l.copy = function() {
        var t2, i2, n2 = new o(this._x, this._y, this._z, this._x0, this._y0, this._z0, this._x1, this._y1, this._z1), e2 = this._root;
        if (!e2)
          return n2;
        if (!e2.length)
          return n2._root = a(e2), n2;
        for (t2 = [{source: e2, target: n2._root = new Array(8)}]; e2 = t2.pop(); )
          for (var s2 = 0; s2 < 8; ++s2)
            (i2 = e2.source[s2]) && (i2.length ? t2.push({source: i2, target: e2.target[s2] = new Array(8)}) : e2.target[s2] = a(i2));
        return n2;
      }, l.add = function(t2) {
        var n2 = +this._x.call(null, t2), e2 = +this._y.call(null, t2), s2 = +this._z.call(null, t2);
        return i(this.cover(n2, e2, s2), n2, e2, s2, t2);
      }, l.addAll = function(t2) {
        var n2, e2, s2, h2, r2, o2 = t2.length, a2 = new Array(o2), l2 = new Array(o2), u = new Array(o2), _ = 1 / 0, f = 1 / 0, c = 1 / 0, y = -1 / 0, x = -1 / 0, d = -1 / 0;
        for (e2 = 0; e2 < o2; ++e2)
          isNaN(s2 = +this._x.call(null, n2 = t2[e2])) || isNaN(h2 = +this._y.call(null, n2)) || isNaN(r2 = +this._z.call(null, n2)) || (a2[e2] = s2, l2[e2] = h2, u[e2] = r2, s2 < _ && (_ = s2), s2 > y && (y = s2), h2 < f && (f = h2), h2 > x && (x = h2), r2 < c && (c = r2), r2 > d && (d = r2));
        if (_ > y || f > x || c > d)
          return this;
        for (this.cover(_, f, c).cover(y, x, d), e2 = 0; e2 < o2; ++e2)
          i(this, a2[e2], l2[e2], u[e2], t2[e2]);
        return this;
      }, l.cover = function(t2, i2, n2) {
        if (isNaN(t2 = +t2) || isNaN(i2 = +i2) || isNaN(n2 = +n2))
          return this;
        var e2 = this._x0, s2 = this._y0, h2 = this._z0, r2 = this._x1, o2 = this._y1, a2 = this._z1;
        if (isNaN(e2))
          r2 = (e2 = Math.floor(t2)) + 1, o2 = (s2 = Math.floor(i2)) + 1, a2 = (h2 = Math.floor(n2)) + 1;
        else {
          for (var l2, u, _ = r2 - e2 || 1, f = this._root; e2 > t2 || t2 >= r2 || s2 > i2 || i2 >= o2 || h2 > n2 || n2 >= a2; )
            switch (u = (n2 < h2) << 2 | (i2 < s2) << 1 | t2 < e2, (l2 = new Array(8))[u] = f, f = l2, _ *= 2, u) {
              case 0:
                r2 = e2 + _, o2 = s2 + _, a2 = h2 + _;
                break;
              case 1:
                e2 = r2 - _, o2 = s2 + _, a2 = h2 + _;
                break;
              case 2:
                r2 = e2 + _, s2 = o2 - _, a2 = h2 + _;
                break;
              case 3:
                e2 = r2 - _, s2 = o2 - _, a2 = h2 + _;
                break;
              case 4:
                r2 = e2 + _, o2 = s2 + _, h2 = a2 - _;
                break;
              case 5:
                e2 = r2 - _, o2 = s2 + _, h2 = a2 - _;
                break;
              case 6:
                r2 = e2 + _, s2 = o2 - _, h2 = a2 - _;
                break;
              case 7:
                e2 = r2 - _, s2 = o2 - _, h2 = a2 - _;
            }
          this._root && this._root.length && (this._root = f);
        }
        return this._x0 = e2, this._y0 = s2, this._z0 = h2, this._x1 = r2, this._y1 = o2, this._z1 = a2, this;
      }, l.data = function() {
        var t2 = [];
        return this.visit(function(i2) {
          if (!i2.length)
            do {
              t2.push(i2.data);
            } while (i2 = i2.next);
        }), t2;
      }, l.extent = function(t2) {
        return arguments.length ? this.cover(+t2[0][0], +t2[0][1], +t2[0][2]).cover(+t2[1][0], +t2[1][1], +t2[1][2]) : isNaN(this._x0) ? void 0 : [[this._x0, this._y0, this._z0], [this._x1, this._y1, this._z1]];
      }, l.find = function(t2, i2, e2, s2) {
        var h2, r2, o2, a2, l2, u, _, f, c, y = this._x0, x = this._y0, d = this._z0, p = this._x1, w = this._y1, z = this._z1, N = [], v = this._root;
        for (v && N.push(new n(v, y, x, d, p, w, z)), s2 == null ? s2 = 1 / 0 : (y = t2 - s2, x = i2 - s2, d = e2 - s2, p = t2 + s2, w = i2 + s2, z = e2 + s2, s2 *= s2); f = N.pop(); )
          if (!(!(v = f.node) || (r2 = f.x0) > p || (o2 = f.y0) > w || (a2 = f.z0) > z || (l2 = f.x1) < y || (u = f.y1) < x || (_ = f.z1) < d))
            if (v.length) {
              var g = (r2 + l2) / 2, b = (o2 + u) / 2, A = (a2 + _) / 2;
              N.push(new n(v[7], g, b, A, l2, u, _), new n(v[6], r2, b, A, g, u, _), new n(v[5], g, o2, A, l2, b, _), new n(v[4], r2, o2, A, g, b, _), new n(v[3], g, b, a2, l2, u, A), new n(v[2], r2, b, a2, g, u, A), new n(v[1], g, o2, a2, l2, b, A), new n(v[0], r2, o2, a2, g, b, A)), (c = (e2 >= A) << 2 | (i2 >= b) << 1 | t2 >= g) && (f = N[N.length - 1], N[N.length - 1] = N[N.length - 1 - c], N[N.length - 1 - c] = f);
            } else {
              var k = t2 - +this._x.call(null, v.data), m = i2 - +this._y.call(null, v.data), M = e2 - +this._z.call(null, v.data), j = k * k + m * m + M * M;
              if (j < s2) {
                var T = Math.sqrt(s2 = j);
                y = t2 - T, x = i2 - T, d = e2 - T, p = t2 + T, w = i2 + T, z = e2 + T, h2 = v.data;
              }
            }
        return h2;
      }, l.remove = function(t2) {
        if (isNaN(h2 = +this._x.call(null, t2)) || isNaN(r2 = +this._y.call(null, t2)) || isNaN(o2 = +this._z.call(null, t2)))
          return this;
        var i2, n2, e2, s2, h2, r2, o2, a2, l2, u, _, f, c, y, x, d = this._root, p = this._x0, w = this._y0, z = this._z0, N = this._x1, v = this._y1, g = this._z1;
        if (!d)
          return this;
        if (d.length)
          for (; ; ) {
            if ((_ = h2 >= (a2 = (p + N) / 2)) ? p = a2 : N = a2, (f = r2 >= (l2 = (w + v) / 2)) ? w = l2 : v = l2, (c = o2 >= (u = (z + g) / 2)) ? z = u : g = u, i2 = d, !(d = d[y = c << 2 | f << 1 | _]))
              return this;
            if (!d.length)
              break;
            (i2[y + 1 & 7] || i2[y + 2 & 7] || i2[y + 3 & 7] || i2[y + 4 & 7] || i2[y + 5 & 7] || i2[y + 6 & 7] || i2[y + 7 & 7]) && (n2 = i2, x = y);
          }
        for (; d.data !== t2; )
          if (e2 = d, !(d = d.next))
            return this;
        return (s2 = d.next) && delete d.next, e2 ? (s2 ? e2.next = s2 : delete e2.next, this) : i2 ? (s2 ? i2[y] = s2 : delete i2[y], (d = i2[0] || i2[1] || i2[2] || i2[3] || i2[4] || i2[5] || i2[6] || i2[7]) && d === (i2[7] || i2[6] || i2[5] || i2[4] || i2[3] || i2[2] || i2[1] || i2[0]) && !d.length && (n2 ? n2[x] = d : this._root = d), this) : (this._root = s2, this);
      }, l.removeAll = function(t2) {
        for (var i2 = 0, n2 = t2.length; i2 < n2; ++i2)
          this.remove(t2[i2]);
        return this;
      }, l.root = function() {
        return this._root;
      }, l.size = function() {
        var t2 = 0;
        return this.visit(function(i2) {
          if (!i2.length)
            do {
              ++t2;
            } while (i2 = i2.next);
        }), t2;
      }, l.visit = function(t2) {
        var i2, e2, s2, h2, r2, o2, a2, l2, u = [], _ = this._root;
        for (_ && u.push(new n(_, this._x0, this._y0, this._z0, this._x1, this._y1, this._z1)); i2 = u.pop(); )
          if (!t2(_ = i2.node, s2 = i2.x0, h2 = i2.y0, r2 = i2.z0, o2 = i2.x1, a2 = i2.y1, l2 = i2.z1) && _.length) {
            var f = (s2 + o2) / 2, c = (h2 + a2) / 2, y = (r2 + l2) / 2;
            (e2 = _[7]) && u.push(new n(e2, f, c, y, o2, a2, l2)), (e2 = _[6]) && u.push(new n(e2, s2, c, y, f, a2, l2)), (e2 = _[5]) && u.push(new n(e2, f, h2, y, o2, c, l2)), (e2 = _[4]) && u.push(new n(e2, s2, h2, y, f, c, l2)), (e2 = _[3]) && u.push(new n(e2, f, c, r2, o2, a2, y)), (e2 = _[2]) && u.push(new n(e2, s2, c, r2, f, a2, y)), (e2 = _[1]) && u.push(new n(e2, f, h2, r2, o2, c, y)), (e2 = _[0]) && u.push(new n(e2, s2, h2, r2, f, c, y));
          }
        return this;
      }, l.visitAfter = function(t2) {
        var i2, e2 = [], s2 = [];
        for (this._root && e2.push(new n(this._root, this._x0, this._y0, this._z0, this._x1, this._y1, this._z1)); i2 = e2.pop(); ) {
          var h2 = i2.node;
          if (h2.length) {
            var r2, o2 = i2.x0, a2 = i2.y0, l2 = i2.z0, u = i2.x1, _ = i2.y1, f = i2.z1, c = (o2 + u) / 2, y = (a2 + _) / 2, x = (l2 + f) / 2;
            (r2 = h2[0]) && e2.push(new n(r2, o2, a2, l2, c, y, x)), (r2 = h2[1]) && e2.push(new n(r2, c, a2, l2, u, y, x)), (r2 = h2[2]) && e2.push(new n(r2, o2, y, l2, c, _, x)), (r2 = h2[3]) && e2.push(new n(r2, c, y, l2, u, _, x)), (r2 = h2[4]) && e2.push(new n(r2, o2, a2, x, c, y, f)), (r2 = h2[5]) && e2.push(new n(r2, c, a2, x, u, y, f)), (r2 = h2[6]) && e2.push(new n(r2, o2, y, x, c, _, f)), (r2 = h2[7]) && e2.push(new n(r2, c, y, x, u, _, f));
          }
          s2.push(i2);
        }
        for (; i2 = s2.pop(); )
          t2(i2.node, i2.x0, i2.y0, i2.z0, i2.x1, i2.y1, i2.z1);
        return this;
      }, l.x = function(t2) {
        return arguments.length ? (this._x = t2, this) : this._x;
      }, l.y = function(t2) {
        return arguments.length ? (this._y = t2, this) : this._y;
      }, l.z = function(t2) {
        return arguments.length ? (this._z = t2, this) : this._z;
      }, t.octree = r, Object.defineProperty(t, "__esModule", {value: true});
    });
    !function(n, t) {
      typeof exports == "object" && typeof module != "undefined" ? t(exports, require2("d3-binarytree"), require2("d3-quadtree"), require2("d3-octree"), require2("d3-dispatch"), require2("d3-timer")) : typeof define == "function" && define.amd ? define(["exports", "d3-binarytree", "d3-quadtree", "d3-octree", "d3-dispatch", "d3-timer"], t) : t((n = typeof globalThis != "undefined" ? globalThis : n || self).d3 = n.d3 || {}, n.d3, n.d3, n.d3, n.d3, n.d3);
    }(this, function(n, t, e, r, i, u) {
      "use strict";
      function o(n2) {
        return function() {
          return n2;
        };
      }
      function f(n2) {
        return 1e-6 * (n2() - 0.5);
      }
      function a(n2) {
        return n2.x + n2.vx;
      }
      function c(n2) {
        return n2.y + n2.vy;
      }
      function l(n2) {
        return n2.z + n2.vz;
      }
      function h(n2) {
        return n2.index;
      }
      function v(n2, t2) {
        var e2 = n2.get(t2);
        if (!e2)
          throw new Error("node not found: " + t2);
        return e2;
      }
      const d = 4294967296;
      function y(n2) {
        return n2.x;
      }
      function s(n2) {
        return n2.y;
      }
      function g(n2) {
        return n2.z;
      }
      var x = Math.PI * (3 - Math.sqrt(5)), z = 20 * Math.PI / (9 + Math.sqrt(221));
      n.forceCenter = function(n2, t2, e2) {
        var r2, i2 = 1;
        function u2() {
          var u3, o2, f2 = r2.length, a2 = 0, c2 = 0, l2 = 0;
          for (u3 = 0; u3 < f2; ++u3)
            a2 += (o2 = r2[u3]).x || 0, c2 += o2.y || 0, l2 += o2.z || 0;
          for (a2 = (a2 / f2 - n2) * i2, c2 = (c2 / f2 - t2) * i2, l2 = (l2 / f2 - e2) * i2, u3 = 0; u3 < f2; ++u3)
            o2 = r2[u3], a2 && (o2.x -= a2), c2 && (o2.y -= c2), l2 && (o2.z -= l2);
        }
        return n2 == null && (n2 = 0), t2 == null && (t2 = 0), e2 == null && (e2 = 0), u2.initialize = function(n3) {
          r2 = n3;
        }, u2.x = function(t3) {
          return arguments.length ? (n2 = +t3, u2) : n2;
        }, u2.y = function(n3) {
          return arguments.length ? (t2 = +n3, u2) : t2;
        }, u2.z = function(n3) {
          return arguments.length ? (e2 = +n3, u2) : e2;
        }, u2.strength = function(n3) {
          return arguments.length ? (i2 = +n3, u2) : i2;
        }, u2;
      }, n.forceCollide = function(n2) {
        var i2, u2, h2, v2, d2 = 1, y2 = 1;
        function s2() {
          for (var n3, o2, s3, x3, z2, p, M, w, q = i2.length, N = 0; N < y2; ++N)
            for (o2 = (u2 === 1 ? t.binarytree(i2, a) : u2 === 2 ? e.quadtree(i2, a, c) : u2 === 3 ? r.octree(i2, a, c, l) : null).visitAfter(g2), n3 = 0; n3 < q; ++n3)
              s3 = i2[n3], M = h2[s3.index], w = M * M, x3 = s3.x + s3.vx, u2 > 1 && (z2 = s3.y + s3.vy), u2 > 2 && (p = s3.z + s3.vz), o2.visit(m);
          function m(n4, t2, e2, r2, i3, o3, a2) {
            var c2 = [t2, e2, r2, i3, o3, a2], l2 = c2[0], h3 = c2[1], y3 = c2[2], g3 = c2[u2], q2 = c2[u2 + 1], N2 = c2[u2 + 2], m2 = n4.data, A = n4.r, b = M + A;
            if (!m2)
              return l2 > x3 + b || g3 < x3 - b || u2 > 1 && (h3 > z2 + b || q2 < z2 - b) || u2 > 2 && (y3 > p + b || N2 < p - b);
            if (m2.index > s3.index) {
              var k = x3 - m2.x - m2.vx, E = u2 > 1 ? z2 - m2.y - m2.vy : 0, j = u2 > 2 ? p - m2.z - m2.vz : 0, D = k * k + E * E + j * j;
              D < b * b && (k === 0 && (D += (k = f(v2)) * k), u2 > 1 && E === 0 && (D += (E = f(v2)) * E), u2 > 2 && j === 0 && (D += (j = f(v2)) * j), D = (b - (D = Math.sqrt(D))) / D * d2, s3.vx += (k *= D) * (b = (A *= A) / (w + A)), u2 > 1 && (s3.vy += (E *= D) * b), u2 > 2 && (s3.vz += (j *= D) * b), m2.vx -= k * (b = 1 - b), u2 > 1 && (m2.vy -= E * b), u2 > 2 && (m2.vz -= j * b));
            }
          }
        }
        function g2(n3) {
          if (n3.data)
            return n3.r = h2[n3.data.index];
          for (var t2 = n3.r = 0; t2 < Math.pow(2, u2); ++t2)
            n3[t2] && n3[t2].r > n3.r && (n3.r = n3[t2].r);
        }
        function x2() {
          if (i2) {
            var t2, e2, r2 = i2.length;
            for (h2 = new Array(r2), t2 = 0; t2 < r2; ++t2)
              e2 = i2[t2], h2[e2.index] = +n2(e2, t2, i2);
          }
        }
        return typeof n2 != "function" && (n2 = o(n2 == null ? 1 : +n2)), s2.initialize = function(n3, ...t2) {
          i2 = n3, v2 = t2.find((n4) => typeof n4 == "function") || Math.random, u2 = t2.find((n4) => [1, 2, 3].includes(n4)) || 2, x2();
        }, s2.iterations = function(n3) {
          return arguments.length ? (y2 = +n3, s2) : y2;
        }, s2.strength = function(n3) {
          return arguments.length ? (d2 = +n3, s2) : d2;
        }, s2.radius = function(t2) {
          return arguments.length ? (n2 = typeof t2 == "function" ? t2 : o(+t2), x2(), s2) : n2;
        }, s2;
      }, n.forceLink = function(n2) {
        var t2, e2, r2, i2, u2, a2, c2, l2 = h, d2 = function(n3) {
          return 1 / Math.min(u2[n3.source.index], u2[n3.target.index]);
        }, y2 = o(30), s2 = 1;
        function g2(r3) {
          for (var u3 = 0, o2 = n2.length; u3 < s2; ++u3)
            for (var l3, h2, v2, d4, y3, g3 = 0, x3 = 0, z3 = 0, p2 = 0; g3 < o2; ++g3)
              h2 = (l3 = n2[g3]).source, x3 = (v2 = l3.target).x + v2.vx - h2.x - h2.vx || f(c2), i2 > 1 && (z3 = v2.y + v2.vy - h2.y - h2.vy || f(c2)), i2 > 2 && (p2 = v2.z + v2.vz - h2.z - h2.vz || f(c2)), x3 *= d4 = ((d4 = Math.sqrt(x3 * x3 + z3 * z3 + p2 * p2)) - e2[g3]) / d4 * r3 * t2[g3], z3 *= d4, p2 *= d4, v2.vx -= x3 * (y3 = a2[g3]), i2 > 1 && (v2.vy -= z3 * y3), i2 > 2 && (v2.vz -= p2 * y3), h2.vx += x3 * (y3 = 1 - y3), i2 > 1 && (h2.vy += z3 * y3), i2 > 2 && (h2.vz += p2 * y3);
        }
        function x2() {
          if (r2) {
            var i3, o2, f2 = r2.length, c3 = n2.length, h2 = new Map(r2.map((n3, t3) => [l2(n3, t3, r2), n3]));
            for (i3 = 0, u2 = new Array(f2); i3 < c3; ++i3)
              (o2 = n2[i3]).index = i3, typeof o2.source != "object" && (o2.source = v(h2, o2.source)), typeof o2.target != "object" && (o2.target = v(h2, o2.target)), u2[o2.source.index] = (u2[o2.source.index] || 0) + 1, u2[o2.target.index] = (u2[o2.target.index] || 0) + 1;
            for (i3 = 0, a2 = new Array(c3); i3 < c3; ++i3)
              o2 = n2[i3], a2[i3] = u2[o2.source.index] / (u2[o2.source.index] + u2[o2.target.index]);
            t2 = new Array(c3), z2(), e2 = new Array(c3), p();
          }
        }
        function z2() {
          if (r2)
            for (var e3 = 0, i3 = n2.length; e3 < i3; ++e3)
              t2[e3] = +d2(n2[e3], e3, n2);
        }
        function p() {
          if (r2)
            for (var t3 = 0, i3 = n2.length; t3 < i3; ++t3)
              e2[t3] = +y2(n2[t3], t3, n2);
        }
        return n2 == null && (n2 = []), g2.initialize = function(n3, ...t3) {
          r2 = n3, c2 = t3.find((n4) => typeof n4 == "function") || Math.random, i2 = t3.find((n4) => [1, 2, 3].includes(n4)) || 2, x2();
        }, g2.links = function(t3) {
          return arguments.length ? (n2 = t3, x2(), g2) : n2;
        }, g2.id = function(n3) {
          return arguments.length ? (l2 = n3, g2) : l2;
        }, g2.iterations = function(n3) {
          return arguments.length ? (s2 = +n3, g2) : s2;
        }, g2.strength = function(n3) {
          return arguments.length ? (d2 = typeof n3 == "function" ? n3 : o(+n3), z2(), g2) : d2;
        }, g2.distance = function(n3) {
          return arguments.length ? (y2 = typeof n3 == "function" ? n3 : o(+n3), p(), g2) : y2;
        }, g2;
      }, n.forceManyBody = function() {
        var n2, i2, u2, a2, c2, l2, h2 = o(-30), v2 = 1, d2 = 1 / 0, x2 = 0.81;
        function z2(o2) {
          var f2, a3 = n2.length, l3 = (i2 === 1 ? t.binarytree(n2, y) : i2 === 2 ? e.quadtree(n2, y, s) : i2 === 3 ? r.octree(n2, y, s, g) : null).visitAfter(M);
          for (c2 = o2, f2 = 0; f2 < a3; ++f2)
            u2 = n2[f2], l3.visit(w);
        }
        function p() {
          if (n2) {
            var t2, e2, r2 = n2.length;
            for (l2 = new Array(r2), t2 = 0; t2 < r2; ++t2)
              e2 = n2[t2], l2[e2.index] = +h2(e2, t2, n2);
          }
        }
        function M(n3) {
          var t2, e2, r2, u3, o2, f2, a3 = 0, c3 = 0, h3 = n3.length;
          if (h3) {
            for (r2 = u3 = o2 = f2 = 0; f2 < h3; ++f2)
              (t2 = n3[f2]) && (e2 = Math.abs(t2.value)) && (a3 += t2.value, c3 += e2, r2 += e2 * (t2.x || 0), u3 += e2 * (t2.y || 0), o2 += e2 * (t2.z || 0));
            a3 *= Math.sqrt(4 / h3), n3.x = r2 / c3, i2 > 1 && (n3.y = u3 / c3), i2 > 2 && (n3.z = o2 / c3);
          } else {
            (t2 = n3).x = t2.data.x, i2 > 1 && (t2.y = t2.data.y), i2 > 2 && (t2.z = t2.data.z);
            do {
              a3 += l2[t2.data.index];
            } while (t2 = t2.next);
          }
          n3.value = a3;
        }
        function w(n3, t2, e2, r2, o2) {
          if (!n3.value)
            return true;
          var h3 = [e2, r2, o2][i2 - 1], y2 = n3.x - u2.x, s2 = i2 > 1 ? n3.y - u2.y : 0, g2 = i2 > 2 ? n3.z - u2.z : 0, z3 = h3 - t2, p2 = y2 * y2 + s2 * s2 + g2 * g2;
          if (z3 * z3 / x2 < p2)
            return p2 < d2 && (y2 === 0 && (p2 += (y2 = f(a2)) * y2), i2 > 1 && s2 === 0 && (p2 += (s2 = f(a2)) * s2), i2 > 2 && g2 === 0 && (p2 += (g2 = f(a2)) * g2), p2 < v2 && (p2 = Math.sqrt(v2 * p2)), u2.vx += y2 * n3.value * c2 / p2, i2 > 1 && (u2.vy += s2 * n3.value * c2 / p2), i2 > 2 && (u2.vz += g2 * n3.value * c2 / p2)), true;
          if (!(n3.length || p2 >= d2)) {
            (n3.data !== u2 || n3.next) && (y2 === 0 && (p2 += (y2 = f(a2)) * y2), i2 > 1 && s2 === 0 && (p2 += (s2 = f(a2)) * s2), i2 > 2 && g2 === 0 && (p2 += (g2 = f(a2)) * g2), p2 < v2 && (p2 = Math.sqrt(v2 * p2)));
            do {
              n3.data !== u2 && (z3 = l2[n3.data.index] * c2 / p2, u2.vx += y2 * z3, i2 > 1 && (u2.vy += s2 * z3), i2 > 2 && (u2.vz += g2 * z3));
            } while (n3 = n3.next);
          }
        }
        return z2.initialize = function(t2, ...e2) {
          n2 = t2, a2 = e2.find((n3) => typeof n3 == "function") || Math.random, i2 = e2.find((n3) => [1, 2, 3].includes(n3)) || 2, p();
        }, z2.strength = function(n3) {
          return arguments.length ? (h2 = typeof n3 == "function" ? n3 : o(+n3), p(), z2) : h2;
        }, z2.distanceMin = function(n3) {
          return arguments.length ? (v2 = n3 * n3, z2) : Math.sqrt(v2);
        }, z2.distanceMax = function(n3) {
          return arguments.length ? (d2 = n3 * n3, z2) : Math.sqrt(d2);
        }, z2.theta = function(n3) {
          return arguments.length ? (x2 = n3 * n3, z2) : Math.sqrt(x2);
        }, z2;
      }, n.forceRadial = function(n2, t2, e2, r2) {
        var i2, u2, f2, a2, c2 = o(0.1);
        function l2(n3) {
          for (var o2 = 0, c3 = i2.length; o2 < c3; ++o2) {
            var l3 = i2[o2], h3 = l3.x - t2 || 1e-6, v2 = (l3.y || 0) - e2 || 1e-6, d2 = (l3.z || 0) - r2 || 1e-6, y2 = Math.sqrt(h3 * h3 + v2 * v2 + d2 * d2), s2 = (a2[o2] - y2) * f2[o2] * n3 / y2;
            l3.vx += h3 * s2, u2 > 1 && (l3.vy += v2 * s2), u2 > 2 && (l3.vz += d2 * s2);
          }
        }
        function h2() {
          if (i2) {
            var t3, e3 = i2.length;
            for (f2 = new Array(e3), a2 = new Array(e3), t3 = 0; t3 < e3; ++t3)
              a2[t3] = +n2(i2[t3], t3, i2), f2[t3] = isNaN(a2[t3]) ? 0 : +c2(i2[t3], t3, i2);
          }
        }
        return typeof n2 != "function" && (n2 = o(+n2)), t2 == null && (t2 = 0), e2 == null && (e2 = 0), r2 == null && (r2 = 0), l2.initialize = function(n3, ...t3) {
          i2 = n3, u2 = t3.find((n4) => [1, 2, 3].includes(n4)) || 2, h2();
        }, l2.strength = function(n3) {
          return arguments.length ? (c2 = typeof n3 == "function" ? n3 : o(+n3), h2(), l2) : c2;
        }, l2.radius = function(t3) {
          return arguments.length ? (n2 = typeof t3 == "function" ? t3 : o(+t3), h2(), l2) : n2;
        }, l2.x = function(n3) {
          return arguments.length ? (t2 = +n3, l2) : t2;
        }, l2.y = function(n3) {
          return arguments.length ? (e2 = +n3, l2) : e2;
        }, l2.z = function(n3) {
          return arguments.length ? (r2 = +n3, l2) : r2;
        }, l2;
      }, n.forceSimulation = function(n2, t2) {
        t2 = t2 || 2;
        var e2, r2 = Math.min(3, Math.max(1, Math.round(t2))), o2 = 1, f2 = 1e-3, a2 = 1 - Math.pow(f2, 1 / 300), c2 = 0, l2 = 0.6, h2 = new Map(), v2 = u.timer(g2), y2 = i.dispatch("tick", "end"), s2 = function() {
          let n3 = 1;
          return () => (n3 = (1664525 * n3 + 1013904223) % d) / d;
        }();
        function g2() {
          p(), y2.call("tick", e2), o2 < f2 && (v2.stop(), y2.call("end", e2));
        }
        function p(t3) {
          var i2, u2, f3 = n2.length;
          t3 === void 0 && (t3 = 1);
          for (var v3 = 0; v3 < t3; ++v3)
            for (o2 += (c2 - o2) * a2, h2.forEach(function(n3) {
              n3(o2);
            }), i2 = 0; i2 < f3; ++i2)
              (u2 = n2[i2]).fx == null ? u2.x += u2.vx *= l2 : (u2.x = u2.fx, u2.vx = 0), r2 > 1 && (u2.fy == null ? u2.y += u2.vy *= l2 : (u2.y = u2.fy, u2.vy = 0)), r2 > 2 && (u2.fz == null ? u2.z += u2.vz *= l2 : (u2.z = u2.fz, u2.vz = 0));
          return e2;
        }
        function M() {
          for (var t3, e3 = 0, i2 = n2.length; e3 < i2; ++e3) {
            if ((t3 = n2[e3]).index = e3, t3.fx != null && (t3.x = t3.fx), t3.fy != null && (t3.y = t3.fy), t3.fz != null && (t3.z = t3.fz), isNaN(t3.x) || r2 > 1 && isNaN(t3.y) || r2 > 2 && isNaN(t3.z)) {
              var u2 = 10 * (r2 > 2 ? Math.cbrt(0.5 + e3) : r2 > 1 ? Math.sqrt(0.5 + e3) : e3), o3 = e3 * x, f3 = e3 * z;
              r2 === 1 ? t3.x = u2 : r2 === 2 ? (t3.x = u2 * Math.cos(o3), t3.y = u2 * Math.sin(o3)) : (t3.x = u2 * Math.sin(o3) * Math.cos(f3), t3.y = u2 * Math.cos(o3), t3.z = u2 * Math.sin(o3) * Math.sin(f3));
            }
            (isNaN(t3.vx) || r2 > 1 && isNaN(t3.vy) || r2 > 2 && isNaN(t3.vz)) && (t3.vx = 0, r2 > 1 && (t3.vy = 0), r2 > 2 && (t3.vz = 0));
          }
        }
        function w(t3) {
          return t3.initialize && t3.initialize(n2, s2, r2), t3;
        }
        return n2 == null && (n2 = []), M(), e2 = {tick: p, restart: function() {
          return v2.restart(g2), e2;
        }, stop: function() {
          return v2.stop(), e2;
        }, numDimensions: function(n3) {
          return arguments.length ? (r2 = Math.min(3, Math.max(1, Math.round(n3))), h2.forEach(w), e2) : r2;
        }, nodes: function(t3) {
          return arguments.length ? (n2 = t3, M(), h2.forEach(w), e2) : n2;
        }, alpha: function(n3) {
          return arguments.length ? (o2 = +n3, e2) : o2;
        }, alphaMin: function(n3) {
          return arguments.length ? (f2 = +n3, e2) : f2;
        }, alphaDecay: function(n3) {
          return arguments.length ? (a2 = +n3, e2) : +a2;
        }, alphaTarget: function(n3) {
          return arguments.length ? (c2 = +n3, e2) : c2;
        }, velocityDecay: function(n3) {
          return arguments.length ? (l2 = 1 - n3, e2) : 1 - l2;
        }, randomSource: function(n3) {
          return arguments.length ? (s2 = n3, h2.forEach(w), e2) : s2;
        }, force: function(n3, t3) {
          return arguments.length > 1 ? (t3 == null ? h2.delete(n3) : h2.set(n3, w(t3)), e2) : h2.get(n3);
        }, find: function() {
          var t3, e3, i2, u2, o3, f3, a3 = Array.prototype.slice.call(arguments), c3 = a3.shift() || 0, l3 = (r2 > 1 ? a3.shift() : null) || 0, h3 = (r2 > 2 ? a3.shift() : null) || 0, v3 = a3.shift() || 1 / 0, d2 = 0, y3 = n2.length;
          for (v3 *= v3, d2 = 0; d2 < y3; ++d2)
            (u2 = (t3 = c3 - (o3 = n2[d2]).x) * t3 + (e3 = l3 - (o3.y || 0)) * e3 + (i2 = h3 - (o3.z || 0)) * i2) < v3 && (f3 = o3, v3 = u2);
          return f3;
        }, on: function(n3, t3) {
          return arguments.length > 1 ? (y2.on(n3, t3), e2) : y2.on(n3);
        }};
      }, n.forceX = function(n2) {
        var t2, e2, r2, i2 = o(0.1);
        function u2(n3) {
          for (var i3, u3 = 0, o2 = t2.length; u3 < o2; ++u3)
            (i3 = t2[u3]).vx += (r2[u3] - i3.x) * e2[u3] * n3;
        }
        function f2() {
          if (t2) {
            var u3, o2 = t2.length;
            for (e2 = new Array(o2), r2 = new Array(o2), u3 = 0; u3 < o2; ++u3)
              e2[u3] = isNaN(r2[u3] = +n2(t2[u3], u3, t2)) ? 0 : +i2(t2[u3], u3, t2);
          }
        }
        return typeof n2 != "function" && (n2 = o(n2 == null ? 0 : +n2)), u2.initialize = function(n3) {
          t2 = n3, f2();
        }, u2.strength = function(n3) {
          return arguments.length ? (i2 = typeof n3 == "function" ? n3 : o(+n3), f2(), u2) : i2;
        }, u2.x = function(t3) {
          return arguments.length ? (n2 = typeof t3 == "function" ? t3 : o(+t3), f2(), u2) : n2;
        }, u2;
      }, n.forceY = function(n2) {
        var t2, e2, r2, i2 = o(0.1);
        function u2(n3) {
          for (var i3, u3 = 0, o2 = t2.length; u3 < o2; ++u3)
            (i3 = t2[u3]).vy += (r2[u3] - i3.y) * e2[u3] * n3;
        }
        function f2() {
          if (t2) {
            var u3, o2 = t2.length;
            for (e2 = new Array(o2), r2 = new Array(o2), u3 = 0; u3 < o2; ++u3)
              e2[u3] = isNaN(r2[u3] = +n2(t2[u3], u3, t2)) ? 0 : +i2(t2[u3], u3, t2);
          }
        }
        return typeof n2 != "function" && (n2 = o(n2 == null ? 0 : +n2)), u2.initialize = function(n3) {
          t2 = n3, f2();
        }, u2.strength = function(n3) {
          return arguments.length ? (i2 = typeof n3 == "function" ? n3 : o(+n3), f2(), u2) : i2;
        }, u2.y = function(t3) {
          return arguments.length ? (n2 = typeof t3 == "function" ? t3 : o(+t3), f2(), u2) : n2;
        }, u2;
      }, n.forceZ = function(n2) {
        var t2, e2, r2, i2 = o(0.1);
        function u2(n3) {
          for (var i3, u3 = 0, o2 = t2.length; u3 < o2; ++u3)
            (i3 = t2[u3]).vz += (r2[u3] - i3.z) * e2[u3] * n3;
        }
        function f2() {
          if (t2) {
            var u3, o2 = t2.length;
            for (e2 = new Array(o2), r2 = new Array(o2), u3 = 0; u3 < o2; ++u3)
              e2[u3] = isNaN(r2[u3] = +n2(t2[u3], u3, t2)) ? 0 : +i2(t2[u3], u3, t2);
          }
        }
        return typeof n2 != "function" && (n2 = o(n2 == null ? 0 : +n2)), u2.initialize = function(n3) {
          t2 = n3, f2();
        }, u2.strength = function(n3) {
          return arguments.length ? (i2 = typeof n3 == "function" ? n3 : o(+n3), f2(), u2) : i2;
        }, u2.z = function(t3) {
          return arguments.length ? (n2 = typeof t3 == "function" ? t3 : o(+t3), f2(), u2) : n2;
        }, u2;
      }, Object.defineProperty(n, "__esModule", {value: true});
    });
    "use strict";
    self.onmessage = function(msg) {
      let use2D = false;
      if (msg.data.type == "pause") {
        this.simulation.stop();
      } else if (msg.data.type == "resume") {
        this.simulation.restart();
      } else if (msg.data.type == "start") {
        let inputNodes = msg.data.nodes;
        let inputNodesPositions = msg.data.positions;
        let inputEdges = msg.data.edges;
        if (msg.data.use2D) {
          use2D = true;
        }
        let nodes = [];
        let links = [];
        Object.entries(inputNodes).forEach((entry) => {
          let [key, node] = entry;
          node.ID = key;
          node.x = inputNodesPositions[node.index * 3 + 0] * 10;
          node.y = inputNodesPositions[node.index * 3 + 1] * 10;
          node.z = inputNodesPositions[node.index * 3 + 2] * 10;
          node.vz = 0;
          nodes.push(node);
        });
        for (let index = 0; index < inputEdges.length / 2; index++) {
          let edgeFrom = inputEdges[index * 2];
          let edgeTo = inputEdges[index * 2 + 1];
          let edgeObject = {
            source: edgeFrom,
            target: edgeTo
          };
          links.push(edgeObject);
        }
        this.repulsiveforce = d3.forceManyBody();
        this.attractiveforce = d3.forceLink(links);
        this.centralForce = d3.forceCenter();
        this.simulation = d3.forceSimulation(nodes).numDimensions(use2D ? 2 : 3).force("charge", this.repulsiveforce).force("link", this.attractiveforce).force("center", centralForce).velocityDecay(0.05).on("tick", async () => {
          for (let vertexIndex = 0; vertexIndex < nodes.length; vertexIndex++) {
            const node = nodes[vertexIndex];
            inputNodesPositions[vertexIndex * 3 + 0] = node.x / 10;
            inputNodesPositions[vertexIndex * 3 + 1] = node.y / 10;
            if (!use2D) {
              inputNodesPositions[vertexIndex * 3 + 2] = node.z / 10;
            } else {
              inputNodesPositions[vertexIndex * 3 + 2] = 0;
            }
          }
          self.postMessage({type: "update", positions: inputNodesPositions});
        }).on("end", () => {
          self.postMessage({type: "stop"});
        });
      }
    };
  };
  var workerFunctionString = workerFunction.toString();
  var workerURL = URL.createObjectURL(new Blob([`(${workerFunctionString})()`], {type: "text/javascript"}));
  var d3ForceLayoutWorker2 = class {
    constructor({
      network = null,
      onUpdate = null,
      onStop = null,
      onStart = null,
      use2D = false
    }) {
      this._network = network;
      this._onUpdate = onUpdate;
      this._onStop = onStop;
      this._onStart = onStart;
      this._use2D = use2D;
      this._layoutWorker = null;
    }
    start() {
      if (!this._layoutWorker) {
        this._layoutWorker = new Worker(workerURL);
        this._layoutWorker.onmessage = (msg) => {
          if (msg.data.type == "update") {
            this._onUpdate?.(msg.data);
          } else if (msg.data.type == "stop") {
            this._onStop?.(msg.data);
            this._layoutRunning = false;
          } else {
            console.log("Layout received Unknown msg: ", msg);
          }
        };
        this._layoutRunning = true;
        this._onStart?.();
        this._layoutWorker.postMessage({
          type: "start",
          nodes: this._network.nodes,
          positions: this._network.positions,
          edges: this._network.indexedEdges,
          use2D: this._use2D
        });
      }
    }
    restart() {
      this.stop();
      this.start();
    }
    stop() {
      if (this._layoutRunning) {
        this._onStop?.();
      }
      this._layoutWorker.terminate();
      this._layoutRunning = false;
      delete this._layoutWorker;
      this._layoutWorker = null;
    }
    resume() {
      this.start();
      if (!this._layoutRunning) {
        this._onStart?.();
      }
      this._layoutWorker.postMessage({type: "resume"});
      this._layoutRunning = true;
    }
    pause() {
      this._layoutWorker.postMessage({type: "pause"});
      this._layoutRunning = false;
      this._onStop?.();
    }
    onUpdate(callback) {
      this._onUpdate = callback;
    }
    onStop(callback) {
      this._onStop = callback;
    }
    onStart(callback) {
      this._onStart = callback;
    }
    isRunning() {
      return this._layoutRunning;
    }
    cleanup() {
      this.stop();
    }
  };
});

// build/_snowpack/env.js
var env_exports = {};
__export(env_exports, {
  MODE: () => MODE,
  NODE_ENV: () => NODE_ENV,
  SSR: () => SSR
});
var MODE = "production";
var NODE_ENV = "production";
var SSR = false;

// build/_snowpack/pkg/gl-matrix.js
var EPSILON = 1e-6;
var ARRAY_TYPE = typeof Float32Array !== "undefined" ? Float32Array : Array;
var RANDOM = Math.random;
var degree = Math.PI / 180;
if (!Math.hypot)
  Math.hypot = function() {
    var y = 0, i = arguments.length;
    while (i--) {
      y += arguments[i] * arguments[i];
    }
    return Math.sqrt(y);
  };
function create$2() {
  var out = new ARRAY_TYPE(9);
  if (ARRAY_TYPE != Float32Array) {
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
  }
  out[0] = 1;
  out[4] = 1;
  out[8] = 1;
  return out;
}
function fromMat4(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[4];
  out[4] = a[5];
  out[5] = a[6];
  out[6] = a[8];
  out[7] = a[9];
  out[8] = a[10];
  return out;
}
function clone$2(a) {
  var out = new ARRAY_TYPE(9);
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  return out;
}
function copy$2(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  return out;
}
function fromValues$2(m00, m01, m02, m10, m11, m12, m20, m21, m22) {
  var out = new ARRAY_TYPE(9);
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m10;
  out[4] = m11;
  out[5] = m12;
  out[6] = m20;
  out[7] = m21;
  out[8] = m22;
  return out;
}
function set$2(out, m00, m01, m02, m10, m11, m12, m20, m21, m22) {
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m10;
  out[4] = m11;
  out[5] = m12;
  out[6] = m20;
  out[7] = m21;
  out[8] = m22;
  return out;
}
function identity$2(out) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
  return out;
}
function transpose$1(out, a) {
  if (out === a) {
    var a01 = a[1], a02 = a[2], a12 = a[5];
    out[1] = a[3];
    out[2] = a[6];
    out[3] = a01;
    out[5] = a[7];
    out[6] = a02;
    out[7] = a12;
  } else {
    out[0] = a[0];
    out[1] = a[3];
    out[2] = a[6];
    out[3] = a[1];
    out[4] = a[4];
    out[5] = a[7];
    out[6] = a[2];
    out[7] = a[5];
    out[8] = a[8];
  }
  return out;
}
function invert$2(out, a) {
  var a00 = a[0], a01 = a[1], a02 = a[2];
  var a10 = a[3], a11 = a[4], a12 = a[5];
  var a20 = a[6], a21 = a[7], a22 = a[8];
  var b01 = a22 * a11 - a12 * a21;
  var b11 = -a22 * a10 + a12 * a20;
  var b21 = a21 * a10 - a11 * a20;
  var det = a00 * b01 + a01 * b11 + a02 * b21;
  if (!det) {
    return null;
  }
  det = 1 / det;
  out[0] = b01 * det;
  out[1] = (-a22 * a01 + a02 * a21) * det;
  out[2] = (a12 * a01 - a02 * a11) * det;
  out[3] = b11 * det;
  out[4] = (a22 * a00 - a02 * a20) * det;
  out[5] = (-a12 * a00 + a02 * a10) * det;
  out[6] = b21 * det;
  out[7] = (-a21 * a00 + a01 * a20) * det;
  out[8] = (a11 * a00 - a01 * a10) * det;
  return out;
}
function adjoint$1(out, a) {
  var a00 = a[0], a01 = a[1], a02 = a[2];
  var a10 = a[3], a11 = a[4], a12 = a[5];
  var a20 = a[6], a21 = a[7], a22 = a[8];
  out[0] = a11 * a22 - a12 * a21;
  out[1] = a02 * a21 - a01 * a22;
  out[2] = a01 * a12 - a02 * a11;
  out[3] = a12 * a20 - a10 * a22;
  out[4] = a00 * a22 - a02 * a20;
  out[5] = a02 * a10 - a00 * a12;
  out[6] = a10 * a21 - a11 * a20;
  out[7] = a01 * a20 - a00 * a21;
  out[8] = a00 * a11 - a01 * a10;
  return out;
}
function determinant$2(a) {
  var a00 = a[0], a01 = a[1], a02 = a[2];
  var a10 = a[3], a11 = a[4], a12 = a[5];
  var a20 = a[6], a21 = a[7], a22 = a[8];
  return a00 * (a22 * a11 - a12 * a21) + a01 * (-a22 * a10 + a12 * a20) + a02 * (a21 * a10 - a11 * a20);
}
function multiply$2(out, a, b) {
  var a00 = a[0], a01 = a[1], a02 = a[2];
  var a10 = a[3], a11 = a[4], a12 = a[5];
  var a20 = a[6], a21 = a[7], a22 = a[8];
  var b00 = b[0], b01 = b[1], b02 = b[2];
  var b10 = b[3], b11 = b[4], b12 = b[5];
  var b20 = b[6], b21 = b[7], b22 = b[8];
  out[0] = b00 * a00 + b01 * a10 + b02 * a20;
  out[1] = b00 * a01 + b01 * a11 + b02 * a21;
  out[2] = b00 * a02 + b01 * a12 + b02 * a22;
  out[3] = b10 * a00 + b11 * a10 + b12 * a20;
  out[4] = b10 * a01 + b11 * a11 + b12 * a21;
  out[5] = b10 * a02 + b11 * a12 + b12 * a22;
  out[6] = b20 * a00 + b21 * a10 + b22 * a20;
  out[7] = b20 * a01 + b21 * a11 + b22 * a21;
  out[8] = b20 * a02 + b21 * a12 + b22 * a22;
  return out;
}
function translate$1(out, a, v) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a10 = a[3], a11 = a[4], a12 = a[5], a20 = a[6], a21 = a[7], a22 = a[8], x = v[0], y = v[1];
  out[0] = a00;
  out[1] = a01;
  out[2] = a02;
  out[3] = a10;
  out[4] = a11;
  out[5] = a12;
  out[6] = x * a00 + y * a10 + a20;
  out[7] = x * a01 + y * a11 + a21;
  out[8] = x * a02 + y * a12 + a22;
  return out;
}
function rotate$2(out, a, rad) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a10 = a[3], a11 = a[4], a12 = a[5], a20 = a[6], a21 = a[7], a22 = a[8], s = Math.sin(rad), c = Math.cos(rad);
  out[0] = c * a00 + s * a10;
  out[1] = c * a01 + s * a11;
  out[2] = c * a02 + s * a12;
  out[3] = c * a10 - s * a00;
  out[4] = c * a11 - s * a01;
  out[5] = c * a12 - s * a02;
  out[6] = a20;
  out[7] = a21;
  out[8] = a22;
  return out;
}
function scale$2(out, a, v) {
  var x = v[0], y = v[1];
  out[0] = x * a[0];
  out[1] = x * a[1];
  out[2] = x * a[2];
  out[3] = y * a[3];
  out[4] = y * a[4];
  out[5] = y * a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  return out;
}
function fromTranslation$1(out, v) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = v[0];
  out[7] = v[1];
  out[8] = 1;
  return out;
}
function fromRotation$2(out, rad) {
  var s = Math.sin(rad), c = Math.cos(rad);
  out[0] = c;
  out[1] = s;
  out[2] = 0;
  out[3] = -s;
  out[4] = c;
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
  return out;
}
function fromScaling$2(out, v) {
  out[0] = v[0];
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = v[1];
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
  return out;
}
function fromMat2d(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = 0;
  out[3] = a[2];
  out[4] = a[3];
  out[5] = 0;
  out[6] = a[4];
  out[7] = a[5];
  out[8] = 1;
  return out;
}
function fromQuat(out, q) {
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;
  var xx = x * x2;
  var yx = y * x2;
  var yy = y * y2;
  var zx = z * x2;
  var zy = z * y2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  out[0] = 1 - yy - zz;
  out[3] = yx - wz;
  out[6] = zx + wy;
  out[1] = yx + wz;
  out[4] = 1 - xx - zz;
  out[7] = zy - wx;
  out[2] = zx - wy;
  out[5] = zy + wx;
  out[8] = 1 - xx - yy;
  return out;
}
function normalFromMat4(out, a) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  var b00 = a00 * a11 - a01 * a10;
  var b01 = a00 * a12 - a02 * a10;
  var b02 = a00 * a13 - a03 * a10;
  var b03 = a01 * a12 - a02 * a11;
  var b04 = a01 * a13 - a03 * a11;
  var b05 = a02 * a13 - a03 * a12;
  var b06 = a20 * a31 - a21 * a30;
  var b07 = a20 * a32 - a22 * a30;
  var b08 = a20 * a33 - a23 * a30;
  var b09 = a21 * a32 - a22 * a31;
  var b10 = a21 * a33 - a23 * a31;
  var b11 = a22 * a33 - a23 * a32;
  var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) {
    return null;
  }
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[2] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[3] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[4] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[5] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[6] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[7] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[8] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  return out;
}
function projection(out, width, height) {
  out[0] = 2 / width;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = -2 / height;
  out[5] = 0;
  out[6] = -1;
  out[7] = 1;
  out[8] = 1;
  return out;
}
function str$2(a) {
  return "mat3(" + a[0] + ", " + a[1] + ", " + a[2] + ", " + a[3] + ", " + a[4] + ", " + a[5] + ", " + a[6] + ", " + a[7] + ", " + a[8] + ")";
}
function frob$2(a) {
  return Math.hypot(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]);
}
function add$2(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  out[3] = a[3] + b[3];
  out[4] = a[4] + b[4];
  out[5] = a[5] + b[5];
  out[6] = a[6] + b[6];
  out[7] = a[7] + b[7];
  out[8] = a[8] + b[8];
  return out;
}
function subtract$2(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  out[3] = a[3] - b[3];
  out[4] = a[4] - b[4];
  out[5] = a[5] - b[5];
  out[6] = a[6] - b[6];
  out[7] = a[7] - b[7];
  out[8] = a[8] - b[8];
  return out;
}
function multiplyScalar$2(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  out[3] = a[3] * b;
  out[4] = a[4] * b;
  out[5] = a[5] * b;
  out[6] = a[6] * b;
  out[7] = a[7] * b;
  out[8] = a[8] * b;
  return out;
}
function multiplyScalarAndAdd$2(out, a, b, scale) {
  out[0] = a[0] + b[0] * scale;
  out[1] = a[1] + b[1] * scale;
  out[2] = a[2] + b[2] * scale;
  out[3] = a[3] + b[3] * scale;
  out[4] = a[4] + b[4] * scale;
  out[5] = a[5] + b[5] * scale;
  out[6] = a[6] + b[6] * scale;
  out[7] = a[7] + b[7] * scale;
  out[8] = a[8] + b[8] * scale;
  return out;
}
function exactEquals$2(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5] && a[6] === b[6] && a[7] === b[7] && a[8] === b[8];
}
function equals$3(a, b) {
  var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7], a8 = a[8];
  var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7], b8 = b[8];
  return Math.abs(a0 - b0) <= EPSILON * Math.max(1, Math.abs(a0), Math.abs(b0)) && Math.abs(a1 - b1) <= EPSILON * Math.max(1, Math.abs(a1), Math.abs(b1)) && Math.abs(a2 - b2) <= EPSILON * Math.max(1, Math.abs(a2), Math.abs(b2)) && Math.abs(a3 - b3) <= EPSILON * Math.max(1, Math.abs(a3), Math.abs(b3)) && Math.abs(a4 - b4) <= EPSILON * Math.max(1, Math.abs(a4), Math.abs(b4)) && Math.abs(a5 - b5) <= EPSILON * Math.max(1, Math.abs(a5), Math.abs(b5)) && Math.abs(a6 - b6) <= EPSILON * Math.max(1, Math.abs(a6), Math.abs(b6)) && Math.abs(a7 - b7) <= EPSILON * Math.max(1, Math.abs(a7), Math.abs(b7)) && Math.abs(a8 - b8) <= EPSILON * Math.max(1, Math.abs(a8), Math.abs(b8));
}
var mul$2 = multiply$2;
var sub$2 = subtract$2;
var mat3 = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  create: create$2,
  fromMat4,
  clone: clone$2,
  copy: copy$2,
  fromValues: fromValues$2,
  set: set$2,
  identity: identity$2,
  transpose: transpose$1,
  invert: invert$2,
  adjoint: adjoint$1,
  determinant: determinant$2,
  multiply: multiply$2,
  translate: translate$1,
  rotate: rotate$2,
  scale: scale$2,
  fromTranslation: fromTranslation$1,
  fromRotation: fromRotation$2,
  fromScaling: fromScaling$2,
  fromMat2d,
  fromQuat,
  normalFromMat4,
  projection,
  str: str$2,
  frob: frob$2,
  add: add$2,
  subtract: subtract$2,
  multiplyScalar: multiplyScalar$2,
  multiplyScalarAndAdd: multiplyScalarAndAdd$2,
  exactEquals: exactEquals$2,
  equals: equals$3,
  mul: mul$2,
  sub: sub$2
});
function create$3() {
  var out = new ARRAY_TYPE(16);
  if (ARRAY_TYPE != Float32Array) {
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
  }
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}
function clone$3(a) {
  var out = new ARRAY_TYPE(16);
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  out[9] = a[9];
  out[10] = a[10];
  out[11] = a[11];
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];
  return out;
}
function copy$3(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  out[6] = a[6];
  out[7] = a[7];
  out[8] = a[8];
  out[9] = a[9];
  out[10] = a[10];
  out[11] = a[11];
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];
  return out;
}
function fromValues$3(m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33) {
  var out = new ARRAY_TYPE(16);
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m03;
  out[4] = m10;
  out[5] = m11;
  out[6] = m12;
  out[7] = m13;
  out[8] = m20;
  out[9] = m21;
  out[10] = m22;
  out[11] = m23;
  out[12] = m30;
  out[13] = m31;
  out[14] = m32;
  out[15] = m33;
  return out;
}
function set$3(out, m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33) {
  out[0] = m00;
  out[1] = m01;
  out[2] = m02;
  out[3] = m03;
  out[4] = m10;
  out[5] = m11;
  out[6] = m12;
  out[7] = m13;
  out[8] = m20;
  out[9] = m21;
  out[10] = m22;
  out[11] = m23;
  out[12] = m30;
  out[13] = m31;
  out[14] = m32;
  out[15] = m33;
  return out;
}
function identity$3(out) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function transpose$2(out, a) {
  if (out === a) {
    var a01 = a[1], a02 = a[2], a03 = a[3];
    var a12 = a[6], a13 = a[7];
    var a23 = a[11];
    out[1] = a[4];
    out[2] = a[8];
    out[3] = a[12];
    out[4] = a01;
    out[6] = a[9];
    out[7] = a[13];
    out[8] = a02;
    out[9] = a12;
    out[11] = a[14];
    out[12] = a03;
    out[13] = a13;
    out[14] = a23;
  } else {
    out[0] = a[0];
    out[1] = a[4];
    out[2] = a[8];
    out[3] = a[12];
    out[4] = a[1];
    out[5] = a[5];
    out[6] = a[9];
    out[7] = a[13];
    out[8] = a[2];
    out[9] = a[6];
    out[10] = a[10];
    out[11] = a[14];
    out[12] = a[3];
    out[13] = a[7];
    out[14] = a[11];
    out[15] = a[15];
  }
  return out;
}
function invert$3(out, a) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  var b00 = a00 * a11 - a01 * a10;
  var b01 = a00 * a12 - a02 * a10;
  var b02 = a00 * a13 - a03 * a10;
  var b03 = a01 * a12 - a02 * a11;
  var b04 = a01 * a13 - a03 * a11;
  var b05 = a02 * a13 - a03 * a12;
  var b06 = a20 * a31 - a21 * a30;
  var b07 = a20 * a32 - a22 * a30;
  var b08 = a20 * a33 - a23 * a30;
  var b09 = a21 * a32 - a22 * a31;
  var b10 = a21 * a33 - a23 * a31;
  var b11 = a22 * a33 - a23 * a32;
  var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) {
    return null;
  }
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}
function adjoint$2(out, a) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  out[0] = a11 * (a22 * a33 - a23 * a32) - a21 * (a12 * a33 - a13 * a32) + a31 * (a12 * a23 - a13 * a22);
  out[1] = -(a01 * (a22 * a33 - a23 * a32) - a21 * (a02 * a33 - a03 * a32) + a31 * (a02 * a23 - a03 * a22));
  out[2] = a01 * (a12 * a33 - a13 * a32) - a11 * (a02 * a33 - a03 * a32) + a31 * (a02 * a13 - a03 * a12);
  out[3] = -(a01 * (a12 * a23 - a13 * a22) - a11 * (a02 * a23 - a03 * a22) + a21 * (a02 * a13 - a03 * a12));
  out[4] = -(a10 * (a22 * a33 - a23 * a32) - a20 * (a12 * a33 - a13 * a32) + a30 * (a12 * a23 - a13 * a22));
  out[5] = a00 * (a22 * a33 - a23 * a32) - a20 * (a02 * a33 - a03 * a32) + a30 * (a02 * a23 - a03 * a22);
  out[6] = -(a00 * (a12 * a33 - a13 * a32) - a10 * (a02 * a33 - a03 * a32) + a30 * (a02 * a13 - a03 * a12));
  out[7] = a00 * (a12 * a23 - a13 * a22) - a10 * (a02 * a23 - a03 * a22) + a20 * (a02 * a13 - a03 * a12);
  out[8] = a10 * (a21 * a33 - a23 * a31) - a20 * (a11 * a33 - a13 * a31) + a30 * (a11 * a23 - a13 * a21);
  out[9] = -(a00 * (a21 * a33 - a23 * a31) - a20 * (a01 * a33 - a03 * a31) + a30 * (a01 * a23 - a03 * a21));
  out[10] = a00 * (a11 * a33 - a13 * a31) - a10 * (a01 * a33 - a03 * a31) + a30 * (a01 * a13 - a03 * a11);
  out[11] = -(a00 * (a11 * a23 - a13 * a21) - a10 * (a01 * a23 - a03 * a21) + a20 * (a01 * a13 - a03 * a11));
  out[12] = -(a10 * (a21 * a32 - a22 * a31) - a20 * (a11 * a32 - a12 * a31) + a30 * (a11 * a22 - a12 * a21));
  out[13] = a00 * (a21 * a32 - a22 * a31) - a20 * (a01 * a32 - a02 * a31) + a30 * (a01 * a22 - a02 * a21);
  out[14] = -(a00 * (a11 * a32 - a12 * a31) - a10 * (a01 * a32 - a02 * a31) + a30 * (a01 * a12 - a02 * a11));
  out[15] = a00 * (a11 * a22 - a12 * a21) - a10 * (a01 * a22 - a02 * a21) + a20 * (a01 * a12 - a02 * a11);
  return out;
}
function determinant$3(a) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  var b00 = a00 * a11 - a01 * a10;
  var b01 = a00 * a12 - a02 * a10;
  var b02 = a00 * a13 - a03 * a10;
  var b03 = a01 * a12 - a02 * a11;
  var b04 = a01 * a13 - a03 * a11;
  var b05 = a02 * a13 - a03 * a12;
  var b06 = a20 * a31 - a21 * a30;
  var b07 = a20 * a32 - a22 * a30;
  var b08 = a20 * a33 - a23 * a30;
  var b09 = a21 * a32 - a22 * a31;
  var b10 = a21 * a33 - a23 * a31;
  var b11 = a22 * a33 - a23 * a32;
  return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
}
function multiply$3(out, a, b) {
  var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[4];
  b1 = b[5];
  b2 = b[6];
  b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[8];
  b1 = b[9];
  b2 = b[10];
  b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  b0 = b[12];
  b1 = b[13];
  b2 = b[14];
  b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  return out;
}
function translate$2(out, a, v) {
  var x = v[0], y = v[1], z = v[2];
  var a00, a01, a02, a03;
  var a10, a11, a12, a13;
  var a20, a21, a22, a23;
  if (a === out) {
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
  } else {
    a00 = a[0];
    a01 = a[1];
    a02 = a[2];
    a03 = a[3];
    a10 = a[4];
    a11 = a[5];
    a12 = a[6];
    a13 = a[7];
    a20 = a[8];
    a21 = a[9];
    a22 = a[10];
    a23 = a[11];
    out[0] = a00;
    out[1] = a01;
    out[2] = a02;
    out[3] = a03;
    out[4] = a10;
    out[5] = a11;
    out[6] = a12;
    out[7] = a13;
    out[8] = a20;
    out[9] = a21;
    out[10] = a22;
    out[11] = a23;
    out[12] = a00 * x + a10 * y + a20 * z + a[12];
    out[13] = a01 * x + a11 * y + a21 * z + a[13];
    out[14] = a02 * x + a12 * y + a22 * z + a[14];
    out[15] = a03 * x + a13 * y + a23 * z + a[15];
  }
  return out;
}
function scale$3(out, a, v) {
  var x = v[0], y = v[1], z = v[2];
  out[0] = a[0] * x;
  out[1] = a[1] * x;
  out[2] = a[2] * x;
  out[3] = a[3] * x;
  out[4] = a[4] * y;
  out[5] = a[5] * y;
  out[6] = a[6] * y;
  out[7] = a[7] * y;
  out[8] = a[8] * z;
  out[9] = a[9] * z;
  out[10] = a[10] * z;
  out[11] = a[11] * z;
  out[12] = a[12];
  out[13] = a[13];
  out[14] = a[14];
  out[15] = a[15];
  return out;
}
function rotate$3(out, a, rad, axis) {
  var x = axis[0], y = axis[1], z = axis[2];
  var len2 = Math.hypot(x, y, z);
  var s, c, t;
  var a00, a01, a02, a03;
  var a10, a11, a12, a13;
  var a20, a21, a22, a23;
  var b00, b01, b02;
  var b10, b11, b12;
  var b20, b21, b22;
  if (len2 < EPSILON) {
    return null;
  }
  len2 = 1 / len2;
  x *= len2;
  y *= len2;
  z *= len2;
  s = Math.sin(rad);
  c = Math.cos(rad);
  t = 1 - c;
  a00 = a[0];
  a01 = a[1];
  a02 = a[2];
  a03 = a[3];
  a10 = a[4];
  a11 = a[5];
  a12 = a[6];
  a13 = a[7];
  a20 = a[8];
  a21 = a[9];
  a22 = a[10];
  a23 = a[11];
  b00 = x * x * t + c;
  b01 = y * x * t + z * s;
  b02 = z * x * t - y * s;
  b10 = x * y * t - z * s;
  b11 = y * y * t + c;
  b12 = z * y * t + x * s;
  b20 = x * z * t + y * s;
  b21 = y * z * t - x * s;
  b22 = z * z * t + c;
  out[0] = a00 * b00 + a10 * b01 + a20 * b02;
  out[1] = a01 * b00 + a11 * b01 + a21 * b02;
  out[2] = a02 * b00 + a12 * b01 + a22 * b02;
  out[3] = a03 * b00 + a13 * b01 + a23 * b02;
  out[4] = a00 * b10 + a10 * b11 + a20 * b12;
  out[5] = a01 * b10 + a11 * b11 + a21 * b12;
  out[6] = a02 * b10 + a12 * b11 + a22 * b12;
  out[7] = a03 * b10 + a13 * b11 + a23 * b12;
  out[8] = a00 * b20 + a10 * b21 + a20 * b22;
  out[9] = a01 * b20 + a11 * b21 + a21 * b22;
  out[10] = a02 * b20 + a12 * b21 + a22 * b22;
  out[11] = a03 * b20 + a13 * b21 + a23 * b22;
  if (a !== out) {
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }
  return out;
}
function rotateX(out, a, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  var a10 = a[4];
  var a11 = a[5];
  var a12 = a[6];
  var a13 = a[7];
  var a20 = a[8];
  var a21 = a[9];
  var a22 = a[10];
  var a23 = a[11];
  if (a !== out) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }
  out[4] = a10 * c + a20 * s;
  out[5] = a11 * c + a21 * s;
  out[6] = a12 * c + a22 * s;
  out[7] = a13 * c + a23 * s;
  out[8] = a20 * c - a10 * s;
  out[9] = a21 * c - a11 * s;
  out[10] = a22 * c - a12 * s;
  out[11] = a23 * c - a13 * s;
  return out;
}
function rotateY(out, a, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  var a00 = a[0];
  var a01 = a[1];
  var a02 = a[2];
  var a03 = a[3];
  var a20 = a[8];
  var a21 = a[9];
  var a22 = a[10];
  var a23 = a[11];
  if (a !== out) {
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }
  out[0] = a00 * c - a20 * s;
  out[1] = a01 * c - a21 * s;
  out[2] = a02 * c - a22 * s;
  out[3] = a03 * c - a23 * s;
  out[8] = a00 * s + a20 * c;
  out[9] = a01 * s + a21 * c;
  out[10] = a02 * s + a22 * c;
  out[11] = a03 * s + a23 * c;
  return out;
}
function rotateZ(out, a, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  var a00 = a[0];
  var a01 = a[1];
  var a02 = a[2];
  var a03 = a[3];
  var a10 = a[4];
  var a11 = a[5];
  var a12 = a[6];
  var a13 = a[7];
  if (a !== out) {
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
  }
  out[0] = a00 * c + a10 * s;
  out[1] = a01 * c + a11 * s;
  out[2] = a02 * c + a12 * s;
  out[3] = a03 * c + a13 * s;
  out[4] = a10 * c - a00 * s;
  out[5] = a11 * c - a01 * s;
  out[6] = a12 * c - a02 * s;
  out[7] = a13 * c - a03 * s;
  return out;
}
function fromTranslation$2(out, v) {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  out[15] = 1;
  return out;
}
function fromScaling$3(out, v) {
  out[0] = v[0];
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = v[1];
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = v[2];
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromRotation$3(out, rad, axis) {
  var x = axis[0], y = axis[1], z = axis[2];
  var len2 = Math.hypot(x, y, z);
  var s, c, t;
  if (len2 < EPSILON) {
    return null;
  }
  len2 = 1 / len2;
  x *= len2;
  y *= len2;
  z *= len2;
  s = Math.sin(rad);
  c = Math.cos(rad);
  t = 1 - c;
  out[0] = x * x * t + c;
  out[1] = y * x * t + z * s;
  out[2] = z * x * t - y * s;
  out[3] = 0;
  out[4] = x * y * t - z * s;
  out[5] = y * y * t + c;
  out[6] = z * y * t + x * s;
  out[7] = 0;
  out[8] = x * z * t + y * s;
  out[9] = y * z * t - x * s;
  out[10] = z * z * t + c;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromXRotation(out, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = c;
  out[6] = s;
  out[7] = 0;
  out[8] = 0;
  out[9] = -s;
  out[10] = c;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromYRotation(out, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  out[0] = c;
  out[1] = 0;
  out[2] = -s;
  out[3] = 0;
  out[4] = 0;
  out[5] = 1;
  out[6] = 0;
  out[7] = 0;
  out[8] = s;
  out[9] = 0;
  out[10] = c;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromZRotation(out, rad) {
  var s = Math.sin(rad);
  var c = Math.cos(rad);
  out[0] = c;
  out[1] = s;
  out[2] = 0;
  out[3] = 0;
  out[4] = -s;
  out[5] = c;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 1;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function fromRotationTranslation(out, q, v) {
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;
  var xx = x * x2;
  var xy = x * y2;
  var xz = x * z2;
  var yy = y * y2;
  var yz = y * z2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  out[0] = 1 - (yy + zz);
  out[1] = xy + wz;
  out[2] = xz - wy;
  out[3] = 0;
  out[4] = xy - wz;
  out[5] = 1 - (xx + zz);
  out[6] = yz + wx;
  out[7] = 0;
  out[8] = xz + wy;
  out[9] = yz - wx;
  out[10] = 1 - (xx + yy);
  out[11] = 0;
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  out[15] = 1;
  return out;
}
function fromQuat2(out, a) {
  var translation = new ARRAY_TYPE(3);
  var bx = -a[0], by = -a[1], bz = -a[2], bw = a[3], ax = a[4], ay = a[5], az = a[6], aw = a[7];
  var magnitude = bx * bx + by * by + bz * bz + bw * bw;
  if (magnitude > 0) {
    translation[0] = (ax * bw + aw * bx + ay * bz - az * by) * 2 / magnitude;
    translation[1] = (ay * bw + aw * by + az * bx - ax * bz) * 2 / magnitude;
    translation[2] = (az * bw + aw * bz + ax * by - ay * bx) * 2 / magnitude;
  } else {
    translation[0] = (ax * bw + aw * bx + ay * bz - az * by) * 2;
    translation[1] = (ay * bw + aw * by + az * bx - ax * bz) * 2;
    translation[2] = (az * bw + aw * bz + ax * by - ay * bx) * 2;
  }
  fromRotationTranslation(out, a, translation);
  return out;
}
function getTranslation(out, mat) {
  out[0] = mat[12];
  out[1] = mat[13];
  out[2] = mat[14];
  return out;
}
function getScaling(out, mat) {
  var m11 = mat[0];
  var m12 = mat[1];
  var m13 = mat[2];
  var m21 = mat[4];
  var m22 = mat[5];
  var m23 = mat[6];
  var m31 = mat[8];
  var m32 = mat[9];
  var m33 = mat[10];
  out[0] = Math.hypot(m11, m12, m13);
  out[1] = Math.hypot(m21, m22, m23);
  out[2] = Math.hypot(m31, m32, m33);
  return out;
}
function getRotation(out, mat) {
  var scaling = new ARRAY_TYPE(3);
  getScaling(scaling, mat);
  var is1 = 1 / scaling[0];
  var is2 = 1 / scaling[1];
  var is3 = 1 / scaling[2];
  var sm11 = mat[0] * is1;
  var sm12 = mat[1] * is2;
  var sm13 = mat[2] * is3;
  var sm21 = mat[4] * is1;
  var sm22 = mat[5] * is2;
  var sm23 = mat[6] * is3;
  var sm31 = mat[8] * is1;
  var sm32 = mat[9] * is2;
  var sm33 = mat[10] * is3;
  var trace = sm11 + sm22 + sm33;
  var S = 0;
  if (trace > 0) {
    S = Math.sqrt(trace + 1) * 2;
    out[3] = 0.25 * S;
    out[0] = (sm23 - sm32) / S;
    out[1] = (sm31 - sm13) / S;
    out[2] = (sm12 - sm21) / S;
  } else if (sm11 > sm22 && sm11 > sm33) {
    S = Math.sqrt(1 + sm11 - sm22 - sm33) * 2;
    out[3] = (sm23 - sm32) / S;
    out[0] = 0.25 * S;
    out[1] = (sm12 + sm21) / S;
    out[2] = (sm31 + sm13) / S;
  } else if (sm22 > sm33) {
    S = Math.sqrt(1 + sm22 - sm11 - sm33) * 2;
    out[3] = (sm31 - sm13) / S;
    out[0] = (sm12 + sm21) / S;
    out[1] = 0.25 * S;
    out[2] = (sm23 + sm32) / S;
  } else {
    S = Math.sqrt(1 + sm33 - sm11 - sm22) * 2;
    out[3] = (sm12 - sm21) / S;
    out[0] = (sm31 + sm13) / S;
    out[1] = (sm23 + sm32) / S;
    out[2] = 0.25 * S;
  }
  return out;
}
function fromRotationTranslationScale(out, q, v, s) {
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;
  var xx = x * x2;
  var xy = x * y2;
  var xz = x * z2;
  var yy = y * y2;
  var yz = y * z2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  var sx = s[0];
  var sy = s[1];
  var sz = s[2];
  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;
  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;
  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  out[15] = 1;
  return out;
}
function fromRotationTranslationScaleOrigin(out, q, v, s, o) {
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;
  var xx = x * x2;
  var xy = x * y2;
  var xz = x * z2;
  var yy = y * y2;
  var yz = y * z2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  var sx = s[0];
  var sy = s[1];
  var sz = s[2];
  var ox = o[0];
  var oy = o[1];
  var oz = o[2];
  var out0 = (1 - (yy + zz)) * sx;
  var out1 = (xy + wz) * sx;
  var out2 = (xz - wy) * sx;
  var out4 = (xy - wz) * sy;
  var out5 = (1 - (xx + zz)) * sy;
  var out6 = (yz + wx) * sy;
  var out8 = (xz + wy) * sz;
  var out9 = (yz - wx) * sz;
  var out10 = (1 - (xx + yy)) * sz;
  out[0] = out0;
  out[1] = out1;
  out[2] = out2;
  out[3] = 0;
  out[4] = out4;
  out[5] = out5;
  out[6] = out6;
  out[7] = 0;
  out[8] = out8;
  out[9] = out9;
  out[10] = out10;
  out[11] = 0;
  out[12] = v[0] + ox - (out0 * ox + out4 * oy + out8 * oz);
  out[13] = v[1] + oy - (out1 * ox + out5 * oy + out9 * oz);
  out[14] = v[2] + oz - (out2 * ox + out6 * oy + out10 * oz);
  out[15] = 1;
  return out;
}
function fromQuat$1(out, q) {
  var x = q[0], y = q[1], z = q[2], w = q[3];
  var x2 = x + x;
  var y2 = y + y;
  var z2 = z + z;
  var xx = x * x2;
  var yx = y * x2;
  var yy = y * y2;
  var zx = z * x2;
  var zy = z * y2;
  var zz = z * z2;
  var wx = w * x2;
  var wy = w * y2;
  var wz = w * z2;
  out[0] = 1 - yy - zz;
  out[1] = yx + wz;
  out[2] = zx - wy;
  out[3] = 0;
  out[4] = yx - wz;
  out[5] = 1 - xx - zz;
  out[6] = zy + wx;
  out[7] = 0;
  out[8] = zx + wy;
  out[9] = zy - wx;
  out[10] = 1 - xx - yy;
  out[11] = 0;
  out[12] = 0;
  out[13] = 0;
  out[14] = 0;
  out[15] = 1;
  return out;
}
function frustum(out, left, right, bottom, top, near, far) {
  var rl = 1 / (right - left);
  var tb = 1 / (top - bottom);
  var nf = 1 / (near - far);
  out[0] = near * 2 * rl;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = near * 2 * tb;
  out[6] = 0;
  out[7] = 0;
  out[8] = (right + left) * rl;
  out[9] = (top + bottom) * tb;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = far * near * 2 * nf;
  out[15] = 0;
  return out;
}
function perspectiveNO(out, fovy, aspect, near, far) {
  var f = 1 / Math.tan(fovy / 2), nf;
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[15] = 0;
  if (far != null && far !== Infinity) {
    nf = 1 / (near - far);
    out[10] = (far + near) * nf;
    out[14] = 2 * far * near * nf;
  } else {
    out[10] = -1;
    out[14] = -2 * near;
  }
  return out;
}
var perspective = perspectiveNO;
function perspectiveZO(out, fovy, aspect, near, far) {
  var f = 1 / Math.tan(fovy / 2), nf;
  out[0] = f / aspect;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = f;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[15] = 0;
  if (far != null && far !== Infinity) {
    nf = 1 / (near - far);
    out[10] = far * nf;
    out[14] = far * near * nf;
  } else {
    out[10] = -1;
    out[14] = -near;
  }
  return out;
}
function perspectiveFromFieldOfView(out, fov, near, far) {
  var upTan = Math.tan(fov.upDegrees * Math.PI / 180);
  var downTan = Math.tan(fov.downDegrees * Math.PI / 180);
  var leftTan = Math.tan(fov.leftDegrees * Math.PI / 180);
  var rightTan = Math.tan(fov.rightDegrees * Math.PI / 180);
  var xScale = 2 / (leftTan + rightTan);
  var yScale = 2 / (upTan + downTan);
  out[0] = xScale;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = yScale;
  out[6] = 0;
  out[7] = 0;
  out[8] = -((leftTan - rightTan) * xScale * 0.5);
  out[9] = (upTan - downTan) * yScale * 0.5;
  out[10] = far / (near - far);
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = far * near / (near - far);
  out[15] = 0;
  return out;
}
function orthoNO(out, left, right, bottom, top, near, far) {
  var lr = 1 / (left - right);
  var bt = 1 / (bottom - top);
  var nf = 1 / (near - far);
  out[0] = -2 * lr;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = -2 * bt;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 2 * nf;
  out[11] = 0;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = (far + near) * nf;
  out[15] = 1;
  return out;
}
var ortho = orthoNO;
function orthoZO(out, left, right, bottom, top, near, far) {
  var lr = 1 / (left - right);
  var bt = 1 / (bottom - top);
  var nf = 1 / (near - far);
  out[0] = -2 * lr;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = -2 * bt;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = nf;
  out[11] = 0;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = near * nf;
  out[15] = 1;
  return out;
}
function lookAt(out, eye, center, up) {
  var x0, x1, x2, y0, y1, y2, z0, z1, z2, len2;
  var eyex = eye[0];
  var eyey = eye[1];
  var eyez = eye[2];
  var upx = up[0];
  var upy = up[1];
  var upz = up[2];
  var centerx = center[0];
  var centery = center[1];
  var centerz = center[2];
  if (Math.abs(eyex - centerx) < EPSILON && Math.abs(eyey - centery) < EPSILON && Math.abs(eyez - centerz) < EPSILON) {
    return identity$3(out);
  }
  z0 = eyex - centerx;
  z1 = eyey - centery;
  z2 = eyez - centerz;
  len2 = 1 / Math.hypot(z0, z1, z2);
  z0 *= len2;
  z1 *= len2;
  z2 *= len2;
  x0 = upy * z2 - upz * z1;
  x1 = upz * z0 - upx * z2;
  x2 = upx * z1 - upy * z0;
  len2 = Math.hypot(x0, x1, x2);
  if (!len2) {
    x0 = 0;
    x1 = 0;
    x2 = 0;
  } else {
    len2 = 1 / len2;
    x0 *= len2;
    x1 *= len2;
    x2 *= len2;
  }
  y0 = z1 * x2 - z2 * x1;
  y1 = z2 * x0 - z0 * x2;
  y2 = z0 * x1 - z1 * x0;
  len2 = Math.hypot(y0, y1, y2);
  if (!len2) {
    y0 = 0;
    y1 = 0;
    y2 = 0;
  } else {
    len2 = 1 / len2;
    y0 *= len2;
    y1 *= len2;
    y2 *= len2;
  }
  out[0] = x0;
  out[1] = y0;
  out[2] = z0;
  out[3] = 0;
  out[4] = x1;
  out[5] = y1;
  out[6] = z1;
  out[7] = 0;
  out[8] = x2;
  out[9] = y2;
  out[10] = z2;
  out[11] = 0;
  out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
  out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
  out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
  out[15] = 1;
  return out;
}
function targetTo(out, eye, target, up) {
  var eyex = eye[0], eyey = eye[1], eyez = eye[2], upx = up[0], upy = up[1], upz = up[2];
  var z0 = eyex - target[0], z1 = eyey - target[1], z2 = eyez - target[2];
  var len2 = z0 * z0 + z1 * z1 + z2 * z2;
  if (len2 > 0) {
    len2 = 1 / Math.sqrt(len2);
    z0 *= len2;
    z1 *= len2;
    z2 *= len2;
  }
  var x0 = upy * z2 - upz * z1, x1 = upz * z0 - upx * z2, x2 = upx * z1 - upy * z0;
  len2 = x0 * x0 + x1 * x1 + x2 * x2;
  if (len2 > 0) {
    len2 = 1 / Math.sqrt(len2);
    x0 *= len2;
    x1 *= len2;
    x2 *= len2;
  }
  out[0] = x0;
  out[1] = x1;
  out[2] = x2;
  out[3] = 0;
  out[4] = z1 * x2 - z2 * x1;
  out[5] = z2 * x0 - z0 * x2;
  out[6] = z0 * x1 - z1 * x0;
  out[7] = 0;
  out[8] = z0;
  out[9] = z1;
  out[10] = z2;
  out[11] = 0;
  out[12] = eyex;
  out[13] = eyey;
  out[14] = eyez;
  out[15] = 1;
  return out;
}
function str$3(a) {
  return "mat4(" + a[0] + ", " + a[1] + ", " + a[2] + ", " + a[3] + ", " + a[4] + ", " + a[5] + ", " + a[6] + ", " + a[7] + ", " + a[8] + ", " + a[9] + ", " + a[10] + ", " + a[11] + ", " + a[12] + ", " + a[13] + ", " + a[14] + ", " + a[15] + ")";
}
function frob$3(a) {
  return Math.hypot(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], a[13], a[14], a[15]);
}
function add$3(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  out[3] = a[3] + b[3];
  out[4] = a[4] + b[4];
  out[5] = a[5] + b[5];
  out[6] = a[6] + b[6];
  out[7] = a[7] + b[7];
  out[8] = a[8] + b[8];
  out[9] = a[9] + b[9];
  out[10] = a[10] + b[10];
  out[11] = a[11] + b[11];
  out[12] = a[12] + b[12];
  out[13] = a[13] + b[13];
  out[14] = a[14] + b[14];
  out[15] = a[15] + b[15];
  return out;
}
function subtract$3(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  out[3] = a[3] - b[3];
  out[4] = a[4] - b[4];
  out[5] = a[5] - b[5];
  out[6] = a[6] - b[6];
  out[7] = a[7] - b[7];
  out[8] = a[8] - b[8];
  out[9] = a[9] - b[9];
  out[10] = a[10] - b[10];
  out[11] = a[11] - b[11];
  out[12] = a[12] - b[12];
  out[13] = a[13] - b[13];
  out[14] = a[14] - b[14];
  out[15] = a[15] - b[15];
  return out;
}
function multiplyScalar$3(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  out[3] = a[3] * b;
  out[4] = a[4] * b;
  out[5] = a[5] * b;
  out[6] = a[6] * b;
  out[7] = a[7] * b;
  out[8] = a[8] * b;
  out[9] = a[9] * b;
  out[10] = a[10] * b;
  out[11] = a[11] * b;
  out[12] = a[12] * b;
  out[13] = a[13] * b;
  out[14] = a[14] * b;
  out[15] = a[15] * b;
  return out;
}
function multiplyScalarAndAdd$3(out, a, b, scale) {
  out[0] = a[0] + b[0] * scale;
  out[1] = a[1] + b[1] * scale;
  out[2] = a[2] + b[2] * scale;
  out[3] = a[3] + b[3] * scale;
  out[4] = a[4] + b[4] * scale;
  out[5] = a[5] + b[5] * scale;
  out[6] = a[6] + b[6] * scale;
  out[7] = a[7] + b[7] * scale;
  out[8] = a[8] + b[8] * scale;
  out[9] = a[9] + b[9] * scale;
  out[10] = a[10] + b[10] * scale;
  out[11] = a[11] + b[11] * scale;
  out[12] = a[12] + b[12] * scale;
  out[13] = a[13] + b[13] * scale;
  out[14] = a[14] + b[14] * scale;
  out[15] = a[15] + b[15] * scale;
  return out;
}
function exactEquals$3(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5] && a[6] === b[6] && a[7] === b[7] && a[8] === b[8] && a[9] === b[9] && a[10] === b[10] && a[11] === b[11] && a[12] === b[12] && a[13] === b[13] && a[14] === b[14] && a[15] === b[15];
}
function equals$4(a, b) {
  var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3];
  var a4 = a[4], a5 = a[5], a6 = a[6], a7 = a[7];
  var a8 = a[8], a9 = a[9], a10 = a[10], a11 = a[11];
  var a12 = a[12], a13 = a[13], a14 = a[14], a15 = a[15];
  var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  var b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7];
  var b8 = b[8], b9 = b[9], b10 = b[10], b11 = b[11];
  var b12 = b[12], b13 = b[13], b14 = b[14], b15 = b[15];
  return Math.abs(a0 - b0) <= EPSILON * Math.max(1, Math.abs(a0), Math.abs(b0)) && Math.abs(a1 - b1) <= EPSILON * Math.max(1, Math.abs(a1), Math.abs(b1)) && Math.abs(a2 - b2) <= EPSILON * Math.max(1, Math.abs(a2), Math.abs(b2)) && Math.abs(a3 - b3) <= EPSILON * Math.max(1, Math.abs(a3), Math.abs(b3)) && Math.abs(a4 - b4) <= EPSILON * Math.max(1, Math.abs(a4), Math.abs(b4)) && Math.abs(a5 - b5) <= EPSILON * Math.max(1, Math.abs(a5), Math.abs(b5)) && Math.abs(a6 - b6) <= EPSILON * Math.max(1, Math.abs(a6), Math.abs(b6)) && Math.abs(a7 - b7) <= EPSILON * Math.max(1, Math.abs(a7), Math.abs(b7)) && Math.abs(a8 - b8) <= EPSILON * Math.max(1, Math.abs(a8), Math.abs(b8)) && Math.abs(a9 - b9) <= EPSILON * Math.max(1, Math.abs(a9), Math.abs(b9)) && Math.abs(a10 - b10) <= EPSILON * Math.max(1, Math.abs(a10), Math.abs(b10)) && Math.abs(a11 - b11) <= EPSILON * Math.max(1, Math.abs(a11), Math.abs(b11)) && Math.abs(a12 - b12) <= EPSILON * Math.max(1, Math.abs(a12), Math.abs(b12)) && Math.abs(a13 - b13) <= EPSILON * Math.max(1, Math.abs(a13), Math.abs(b13)) && Math.abs(a14 - b14) <= EPSILON * Math.max(1, Math.abs(a14), Math.abs(b14)) && Math.abs(a15 - b15) <= EPSILON * Math.max(1, Math.abs(a15), Math.abs(b15));
}
var mul$3 = multiply$3;
var sub$3 = subtract$3;
var mat4 = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  create: create$3,
  clone: clone$3,
  copy: copy$3,
  fromValues: fromValues$3,
  set: set$3,
  identity: identity$3,
  transpose: transpose$2,
  invert: invert$3,
  adjoint: adjoint$2,
  determinant: determinant$3,
  multiply: multiply$3,
  translate: translate$2,
  scale: scale$3,
  rotate: rotate$3,
  rotateX,
  rotateY,
  rotateZ,
  fromTranslation: fromTranslation$2,
  fromScaling: fromScaling$3,
  fromRotation: fromRotation$3,
  fromXRotation,
  fromYRotation,
  fromZRotation,
  fromRotationTranslation,
  fromQuat2,
  getTranslation,
  getScaling,
  getRotation,
  fromRotationTranslationScale,
  fromRotationTranslationScaleOrigin,
  fromQuat: fromQuat$1,
  frustum,
  perspectiveNO,
  perspective,
  perspectiveZO,
  perspectiveFromFieldOfView,
  orthoNO,
  ortho,
  orthoZO,
  lookAt,
  targetTo,
  str: str$3,
  frob: frob$3,
  add: add$3,
  subtract: subtract$3,
  multiplyScalar: multiplyScalar$3,
  multiplyScalarAndAdd: multiplyScalarAndAdd$3,
  exactEquals: exactEquals$3,
  equals: equals$4,
  mul: mul$3,
  sub: sub$3
});
function create$4() {
  var out = new ARRAY_TYPE(3);
  if (ARRAY_TYPE != Float32Array) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
  }
  return out;
}
function clone$4(a) {
  var out = new ARRAY_TYPE(3);
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
}
function length(a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  return Math.hypot(x, y, z);
}
function fromValues$4(x, y, z) {
  var out = new ARRAY_TYPE(3);
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}
function copy$4(out, a) {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  return out;
}
function set$4(out, x, y, z) {
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}
function add$4(out, a, b) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  return out;
}
function subtract$4(out, a, b) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  return out;
}
function multiply$4(out, a, b) {
  out[0] = a[0] * b[0];
  out[1] = a[1] * b[1];
  out[2] = a[2] * b[2];
  return out;
}
function divide(out, a, b) {
  out[0] = a[0] / b[0];
  out[1] = a[1] / b[1];
  out[2] = a[2] / b[2];
  return out;
}
function ceil(out, a) {
  out[0] = Math.ceil(a[0]);
  out[1] = Math.ceil(a[1]);
  out[2] = Math.ceil(a[2]);
  return out;
}
function floor(out, a) {
  out[0] = Math.floor(a[0]);
  out[1] = Math.floor(a[1]);
  out[2] = Math.floor(a[2]);
  return out;
}
function min(out, a, b) {
  out[0] = Math.min(a[0], b[0]);
  out[1] = Math.min(a[1], b[1]);
  out[2] = Math.min(a[2], b[2]);
  return out;
}
function max(out, a, b) {
  out[0] = Math.max(a[0], b[0]);
  out[1] = Math.max(a[1], b[1]);
  out[2] = Math.max(a[2], b[2]);
  return out;
}
function round(out, a) {
  out[0] = Math.round(a[0]);
  out[1] = Math.round(a[1]);
  out[2] = Math.round(a[2]);
  return out;
}
function scale$4(out, a, b) {
  out[0] = a[0] * b;
  out[1] = a[1] * b;
  out[2] = a[2] * b;
  return out;
}
function scaleAndAdd(out, a, b, scale) {
  out[0] = a[0] + b[0] * scale;
  out[1] = a[1] + b[1] * scale;
  out[2] = a[2] + b[2] * scale;
  return out;
}
function distance(a, b) {
  var x = b[0] - a[0];
  var y = b[1] - a[1];
  var z = b[2] - a[2];
  return Math.hypot(x, y, z);
}
function squaredDistance(a, b) {
  var x = b[0] - a[0];
  var y = b[1] - a[1];
  var z = b[2] - a[2];
  return x * x + y * y + z * z;
}
function squaredLength(a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  return x * x + y * y + z * z;
}
function negate(out, a) {
  out[0] = -a[0];
  out[1] = -a[1];
  out[2] = -a[2];
  return out;
}
function inverse(out, a) {
  out[0] = 1 / a[0];
  out[1] = 1 / a[1];
  out[2] = 1 / a[2];
  return out;
}
function normalize(out, a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  var len2 = x * x + y * y + z * z;
  if (len2 > 0) {
    len2 = 1 / Math.sqrt(len2);
  }
  out[0] = a[0] * len2;
  out[1] = a[1] * len2;
  out[2] = a[2] * len2;
  return out;
}
function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(out, a, b) {
  var ax = a[0], ay = a[1], az = a[2];
  var bx = b[0], by = b[1], bz = b[2];
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}
function lerp(out, a, b, t) {
  var ax = a[0];
  var ay = a[1];
  var az = a[2];
  out[0] = ax + t * (b[0] - ax);
  out[1] = ay + t * (b[1] - ay);
  out[2] = az + t * (b[2] - az);
  return out;
}
function hermite(out, a, b, c, d, t) {
  var factorTimes2 = t * t;
  var factor1 = factorTimes2 * (2 * t - 3) + 1;
  var factor2 = factorTimes2 * (t - 2) + t;
  var factor3 = factorTimes2 * (t - 1);
  var factor4 = factorTimes2 * (3 - 2 * t);
  out[0] = a[0] * factor1 + b[0] * factor2 + c[0] * factor3 + d[0] * factor4;
  out[1] = a[1] * factor1 + b[1] * factor2 + c[1] * factor3 + d[1] * factor4;
  out[2] = a[2] * factor1 + b[2] * factor2 + c[2] * factor3 + d[2] * factor4;
  return out;
}
function bezier(out, a, b, c, d, t) {
  var inverseFactor = 1 - t;
  var inverseFactorTimesTwo = inverseFactor * inverseFactor;
  var factorTimes2 = t * t;
  var factor1 = inverseFactorTimesTwo * inverseFactor;
  var factor2 = 3 * t * inverseFactorTimesTwo;
  var factor3 = 3 * factorTimes2 * inverseFactor;
  var factor4 = factorTimes2 * t;
  out[0] = a[0] * factor1 + b[0] * factor2 + c[0] * factor3 + d[0] * factor4;
  out[1] = a[1] * factor1 + b[1] * factor2 + c[1] * factor3 + d[1] * factor4;
  out[2] = a[2] * factor1 + b[2] * factor2 + c[2] * factor3 + d[2] * factor4;
  return out;
}
function random(out, scale) {
  scale = scale || 1;
  var r = RANDOM() * 2 * Math.PI;
  var z = RANDOM() * 2 - 1;
  var zScale = Math.sqrt(1 - z * z) * scale;
  out[0] = Math.cos(r) * zScale;
  out[1] = Math.sin(r) * zScale;
  out[2] = z * scale;
  return out;
}
function transformMat4(out, a, m) {
  var x = a[0], y = a[1], z = a[2];
  var w = m[3] * x + m[7] * y + m[11] * z + m[15];
  w = w || 1;
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return out;
}
function transformMat3(out, a, m) {
  var x = a[0], y = a[1], z = a[2];
  out[0] = x * m[0] + y * m[3] + z * m[6];
  out[1] = x * m[1] + y * m[4] + z * m[7];
  out[2] = x * m[2] + y * m[5] + z * m[8];
  return out;
}
function transformQuat(out, a, q) {
  var qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  var x = a[0], y = a[1], z = a[2];
  var uvx = qy * z - qz * y, uvy = qz * x - qx * z, uvz = qx * y - qy * x;
  var uuvx = qy * uvz - qz * uvy, uuvy = qz * uvx - qx * uvz, uuvz = qx * uvy - qy * uvx;
  var w2 = qw * 2;
  uvx *= w2;
  uvy *= w2;
  uvz *= w2;
  uuvx *= 2;
  uuvy *= 2;
  uuvz *= 2;
  out[0] = x + uvx + uuvx;
  out[1] = y + uvy + uuvy;
  out[2] = z + uvz + uuvz;
  return out;
}
function rotateX$1(out, a, b, rad) {
  var p = [], r = [];
  p[0] = a[0] - b[0];
  p[1] = a[1] - b[1];
  p[2] = a[2] - b[2];
  r[0] = p[0];
  r[1] = p[1] * Math.cos(rad) - p[2] * Math.sin(rad);
  r[2] = p[1] * Math.sin(rad) + p[2] * Math.cos(rad);
  out[0] = r[0] + b[0];
  out[1] = r[1] + b[1];
  out[2] = r[2] + b[2];
  return out;
}
function rotateY$1(out, a, b, rad) {
  var p = [], r = [];
  p[0] = a[0] - b[0];
  p[1] = a[1] - b[1];
  p[2] = a[2] - b[2];
  r[0] = p[2] * Math.sin(rad) + p[0] * Math.cos(rad);
  r[1] = p[1];
  r[2] = p[2] * Math.cos(rad) - p[0] * Math.sin(rad);
  out[0] = r[0] + b[0];
  out[1] = r[1] + b[1];
  out[2] = r[2] + b[2];
  return out;
}
function rotateZ$1(out, a, b, rad) {
  var p = [], r = [];
  p[0] = a[0] - b[0];
  p[1] = a[1] - b[1];
  p[2] = a[2] - b[2];
  r[0] = p[0] * Math.cos(rad) - p[1] * Math.sin(rad);
  r[1] = p[0] * Math.sin(rad) + p[1] * Math.cos(rad);
  r[2] = p[2];
  out[0] = r[0] + b[0];
  out[1] = r[1] + b[1];
  out[2] = r[2] + b[2];
  return out;
}
function angle(a, b) {
  var ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2], mag1 = Math.sqrt(ax * ax + ay * ay + az * az), mag2 = Math.sqrt(bx * bx + by * by + bz * bz), mag = mag1 * mag2, cosine = mag && dot(a, b) / mag;
  return Math.acos(Math.min(Math.max(cosine, -1), 1));
}
function zero(out) {
  out[0] = 0;
  out[1] = 0;
  out[2] = 0;
  return out;
}
function str$4(a) {
  return "vec3(" + a[0] + ", " + a[1] + ", " + a[2] + ")";
}
function exactEquals$4(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}
function equals$5(a, b) {
  var a0 = a[0], a1 = a[1], a2 = a[2];
  var b0 = b[0], b1 = b[1], b2 = b[2];
  return Math.abs(a0 - b0) <= EPSILON * Math.max(1, Math.abs(a0), Math.abs(b0)) && Math.abs(a1 - b1) <= EPSILON * Math.max(1, Math.abs(a1), Math.abs(b1)) && Math.abs(a2 - b2) <= EPSILON * Math.max(1, Math.abs(a2), Math.abs(b2));
}
var sub$4 = subtract$4;
var mul$4 = multiply$4;
var div = divide;
var dist = distance;
var sqrDist = squaredDistance;
var len = length;
var sqrLen = squaredLength;
var forEach = function() {
  var vec = create$4();
  return function(a, stride, offset, count, fn, arg) {
    var i, l;
    if (!stride) {
      stride = 3;
    }
    if (!offset) {
      offset = 0;
    }
    if (count) {
      l = Math.min(count * stride + offset, a.length);
    } else {
      l = a.length;
    }
    for (i = offset; i < l; i += stride) {
      vec[0] = a[i];
      vec[1] = a[i + 1];
      vec[2] = a[i + 2];
      fn(vec, vec, arg);
      a[i] = vec[0];
      a[i + 1] = vec[1];
      a[i + 2] = vec[2];
    }
    return a;
  };
}();
var vec3 = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  create: create$4,
  clone: clone$4,
  length,
  fromValues: fromValues$4,
  copy: copy$4,
  set: set$4,
  add: add$4,
  subtract: subtract$4,
  multiply: multiply$4,
  divide,
  ceil,
  floor,
  min,
  max,
  round,
  scale: scale$4,
  scaleAndAdd,
  distance,
  squaredDistance,
  squaredLength,
  negate,
  inverse,
  normalize,
  dot,
  cross,
  lerp,
  hermite,
  bezier,
  random,
  transformMat4,
  transformMat3,
  transformQuat,
  rotateX: rotateX$1,
  rotateY: rotateY$1,
  rotateZ: rotateZ$1,
  angle,
  zero,
  str: str$4,
  exactEquals: exactEquals$4,
  equals: equals$5,
  sub: sub$4,
  mul: mul$4,
  div,
  dist,
  sqrDist,
  len,
  sqrLen,
  forEach
});
function create$5() {
  var out = new ARRAY_TYPE(4);
  if (ARRAY_TYPE != Float32Array) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
  }
  return out;
}
function normalize$1(out, a) {
  var x = a[0];
  var y = a[1];
  var z = a[2];
  var w = a[3];
  var len2 = x * x + y * y + z * z + w * w;
  if (len2 > 0) {
    len2 = 1 / Math.sqrt(len2);
  }
  out[0] = x * len2;
  out[1] = y * len2;
  out[2] = z * len2;
  out[3] = w * len2;
  return out;
}
var forEach$1 = function() {
  var vec = create$5();
  return function(a, stride, offset, count, fn, arg) {
    var i, l;
    if (!stride) {
      stride = 4;
    }
    if (!offset) {
      offset = 0;
    }
    if (count) {
      l = Math.min(count * stride + offset, a.length);
    } else {
      l = a.length;
    }
    for (i = offset; i < l; i += stride) {
      vec[0] = a[i];
      vec[1] = a[i + 1];
      vec[2] = a[i + 2];
      vec[3] = a[i + 3];
      fn(vec, vec, arg);
      a[i] = vec[0];
      a[i + 1] = vec[1];
      a[i + 2] = vec[2];
      a[i + 3] = vec[3];
    }
    return a;
  };
}();
function create$6() {
  var out = new ARRAY_TYPE(4);
  if (ARRAY_TYPE != Float32Array) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
  }
  out[3] = 1;
  return out;
}
function setAxisAngle(out, axis, rad) {
  rad = rad * 0.5;
  var s = Math.sin(rad);
  out[0] = s * axis[0];
  out[1] = s * axis[1];
  out[2] = s * axis[2];
  out[3] = Math.cos(rad);
  return out;
}
function slerp(out, a, b, t) {
  var ax = a[0], ay = a[1], az = a[2], aw = a[3];
  var bx = b[0], by = b[1], bz = b[2], bw = b[3];
  var omega, cosom, sinom, scale0, scale1;
  cosom = ax * bx + ay * by + az * bz + aw * bw;
  if (cosom < 0) {
    cosom = -cosom;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (1 - cosom > EPSILON) {
    omega = Math.acos(cosom);
    sinom = Math.sin(omega);
    scale0 = Math.sin((1 - t) * omega) / sinom;
    scale1 = Math.sin(t * omega) / sinom;
  } else {
    scale0 = 1 - t;
    scale1 = t;
  }
  out[0] = scale0 * ax + scale1 * bx;
  out[1] = scale0 * ay + scale1 * by;
  out[2] = scale0 * az + scale1 * bz;
  out[3] = scale0 * aw + scale1 * bw;
  return out;
}
function fromMat3(out, m) {
  var fTrace = m[0] + m[4] + m[8];
  var fRoot;
  if (fTrace > 0) {
    fRoot = Math.sqrt(fTrace + 1);
    out[3] = 0.5 * fRoot;
    fRoot = 0.5 / fRoot;
    out[0] = (m[5] - m[7]) * fRoot;
    out[1] = (m[6] - m[2]) * fRoot;
    out[2] = (m[1] - m[3]) * fRoot;
  } else {
    var i = 0;
    if (m[4] > m[0])
      i = 1;
    if (m[8] > m[i * 3 + i])
      i = 2;
    var j = (i + 1) % 3;
    var k = (i + 2) % 3;
    fRoot = Math.sqrt(m[i * 3 + i] - m[j * 3 + j] - m[k * 3 + k] + 1);
    out[i] = 0.5 * fRoot;
    fRoot = 0.5 / fRoot;
    out[3] = (m[j * 3 + k] - m[k * 3 + j]) * fRoot;
    out[j] = (m[j * 3 + i] + m[i * 3 + j]) * fRoot;
    out[k] = (m[k * 3 + i] + m[i * 3 + k]) * fRoot;
  }
  return out;
}
var normalize$2 = normalize$1;
var rotationTo = function() {
  var tmpvec3 = create$4();
  var xUnitVec3 = fromValues$4(1, 0, 0);
  var yUnitVec3 = fromValues$4(0, 1, 0);
  return function(out, a, b) {
    var dot$1 = dot(a, b);
    if (dot$1 < -0.999999) {
      cross(tmpvec3, xUnitVec3, a);
      if (len(tmpvec3) < 1e-6)
        cross(tmpvec3, yUnitVec3, a);
      normalize(tmpvec3, tmpvec3);
      setAxisAngle(out, tmpvec3, Math.PI);
      return out;
    } else if (dot$1 > 0.999999) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      out[3] = 1;
      return out;
    } else {
      cross(tmpvec3, a, b);
      out[0] = tmpvec3[0];
      out[1] = tmpvec3[1];
      out[2] = tmpvec3[2];
      out[3] = 1 + dot$1;
      return normalize$2(out, out);
    }
  };
}();
var sqlerp = function() {
  var temp1 = create$6();
  var temp2 = create$6();
  return function(out, a, b, c, d, t) {
    slerp(temp1, a, d, t);
    slerp(temp2, b, c, t);
    slerp(out, temp1, temp2, 2 * t * (1 - t));
    return out;
  };
}();
var setAxes = function() {
  var matr = create$2();
  return function(out, view, right, up) {
    matr[0] = right[0];
    matr[3] = right[1];
    matr[6] = right[2];
    matr[1] = up[0];
    matr[4] = up[1];
    matr[7] = up[2];
    matr[2] = -view[0];
    matr[5] = -view[1];
    matr[8] = -view[2];
    return normalize$2(out, fromMat3(out, matr));
  };
}();
function create$8() {
  var out = new ARRAY_TYPE(2);
  if (ARRAY_TYPE != Float32Array) {
    out[0] = 0;
    out[1] = 0;
  }
  return out;
}
var forEach$2 = function() {
  var vec = create$8();
  return function(a, stride, offset, count, fn, arg) {
    var i, l;
    if (!stride) {
      stride = 2;
    }
    if (!offset) {
      offset = 0;
    }
    if (count) {
      l = Math.min(count * stride + offset, a.length);
    } else {
      l = a.length;
    }
    for (i = offset; i < l; i += stride) {
      vec[0] = a[i];
      vec[1] = a[i + 1];
      fn(vec, vec, arg);
      a[i] = vec[0];
      a[i + 1] = vec[1];
    }
    return a;
  };
}();

// build/_snowpack/pkg/@colormap/core.js
function findIndex(nodes, value, start2, stop) {
  if (stop <= start2) {
    return start2;
  }
  const index = Math.floor(start2 + (stop - start2) / 2);
  const delta = value - nodes[index].value;
  const delta1 = value - nodes[index + 1].value;
  if (delta < 0) {
    return findIndex(nodes, value, start2, index - 1);
  } else if (delta1 < 0) {
    return index;
  } else {
    return findIndex(nodes, value, index + 1, stop);
  }
}
var linearMixer = (value, lowerNodeValue, upperNodeValue) => {
  const frac = (value - lowerNodeValue) / (upperNodeValue - lowerNodeValue);
  return [1 - frac, frac];
};
function isNode(node) {
  return node.value !== void 0 && node.mapped !== void 0;
}
function isNodeArray(nodes) {
  return nodes.length > 0 && isNode(nodes[0]);
}
function colorCombination(a, X, b, Y) {
  return [
    a * X[0] + b * Y[0],
    a * X[1] + b * Y[1],
    a * X[2] + b * Y[2]
  ];
}
function ensureMixer(mixer) {
  return mixer ? mixer : linearMixer;
}
function createColorMap(colors2, scale, mixer) {
  if (!Array.isArray(colors2) || colors2.length < 1) {
    return noColorMap;
  }
  if (isNodeArray(colors2)) {
    return createMapFromNodes(colors2, scale, ensureMixer(mixer), colorCombination);
  } else {
    return createMapFromArray(colors2, scale, ensureMixer(mixer), colorCombination);
  }
}
function createMapFromNodes(nodes, scale, mixer, linearCombination) {
  const sortedNodes = nodes.sort((a, b) => a.value < b.value ? -1 : 1);
  return function(value) {
    const scaledValue = scale(value);
    const index = findIndex(sortedNodes, scaledValue, 0, sortedNodes.length - 1);
    if (index == 0 && scaledValue < sortedNodes[0].value) {
      return sortedNodes[index].mapped;
    } else if (index == sortedNodes.length - 1) {
      return sortedNodes[index].mapped;
    }
    const [coeff0, coeff1] = mixer(scaledValue, sortedNodes[index].value, sortedNodes[index + 1].value);
    return linearCombination(coeff0, sortedNodes[index].mapped, coeff1, sortedNodes[index + 1].mapped);
  };
}
function createMapFromArray(arr, scale, mixer, linearCombination) {
  return function(value) {
    const scaledValue = scale(value);
    const indexFloat = (arr.length - 1) * scaledValue;
    if (indexFloat <= 0) {
      return arr[0];
    } else if (indexFloat >= arr.length - 1) {
      return arr[arr.length - 1];
    }
    const index = Math.floor(indexFloat);
    const [coeff0, coeff1] = mixer(indexFloat, index, index + 1);
    return linearCombination(coeff0, arr[index], coeff1, arr[index + 1]);
  };
}
function noColorMap(_value) {
  return [0, 0, 0];
}
function linearScale(domain, range) {
  let [d0, d1] = domain;
  const [r0, r1] = range;
  if (Math.abs(d0 - d1) < Number.EPSILON) {
    d1 = d0 + 1;
  }
  return function(value) {
    return r0 + (r1 - r0) * ((value - d0) / (d1 - d0));
  };
}

// build/_snowpack/pkg/@colormap/presets.js
var colors$2 = [
  [1462e-6, 466e-6, 0.013866],
  [2267e-6, 127e-5, 0.01857],
  [3299e-6, 2249e-6, 0.024239],
  [4547e-6, 3392e-6, 0.030909],
  [6006e-6, 4692e-6, 0.038558],
  [7676e-6, 6136e-6, 0.046836],
  [9561e-6, 7713e-6, 0.055143],
  [0.011663, 9417e-6, 0.06346],
  [0.013995, 0.011225, 0.071862],
  [0.016561, 0.013136, 0.080282],
  [0.019373, 0.015133, 0.088767],
  [0.022447, 0.017199, 0.097327],
  [0.025793, 0.019331, 0.10593],
  [0.029432, 0.021503, 0.114621],
  [0.033385, 0.023702, 0.123397],
  [0.037668, 0.025921, 0.132232],
  [0.042253, 0.028139, 0.141141],
  [0.046915, 0.030324, 0.150164],
  [0.051644, 0.032474, 0.159254],
  [0.056449, 0.034569, 0.168414],
  [0.06134, 0.03659, 0.177642],
  [0.066331, 0.038504, 0.186962],
  [0.071429, 0.040294, 0.196354],
  [0.076637, 0.041905, 0.205799],
  [0.081962, 0.043328, 0.215289],
  [0.087411, 0.044556, 0.224813],
  [0.09299, 0.045583, 0.234358],
  [0.098702, 0.046402, 0.243904],
  [0.104551, 0.047008, 0.25343],
  [0.110536, 0.047399, 0.262912],
  [0.116656, 0.047574, 0.272321],
  [0.122908, 0.047536, 0.281624],
  [0.129285, 0.047293, 0.290788],
  [0.135778, 0.046856, 0.299776],
  [0.142378, 0.046242, 0.308553],
  [0.149073, 0.045468, 0.317085],
  [0.15585, 0.044559, 0.325338],
  [0.162689, 0.043554, 0.333277],
  [0.169575, 0.042489, 0.340874],
  [0.176493, 0.041402, 0.348111],
  [0.183429, 0.040329, 0.354971],
  [0.190367, 0.039309, 0.361447],
  [0.197297, 0.0384, 0.367535],
  [0.204209, 0.037632, 0.373238],
  [0.211095, 0.03703, 0.378563],
  [0.217949, 0.036615, 0.383522],
  [0.224763, 0.036405, 0.388129],
  [0.231538, 0.036405, 0.3924],
  [0.238273, 0.036621, 0.396353],
  [0.244967, 0.037055, 0.400007],
  [0.25162, 0.037705, 0.403378],
  [0.258234, 0.038571, 0.406485],
  [0.26481, 0.039647, 0.409345],
  [0.271347, 0.040922, 0.411976],
  [0.27785, 0.042353, 0.414392],
  [0.284321, 0.043933, 0.416608],
  [0.290763, 0.045644, 0.418637],
  [0.297178, 0.04747, 0.420491],
  [0.303568, 0.049396, 0.422182],
  [0.309935, 0.051407, 0.423721],
  [0.316282, 0.05349, 0.425116],
  [0.32261, 0.055634, 0.426377],
  [0.328921, 0.057827, 0.427511],
  [0.335217, 0.06006, 0.428524],
  [0.3415, 0.062325, 0.429425],
  [0.347771, 0.064616, 0.430217],
  [0.354032, 0.066925, 0.430906],
  [0.360284, 0.069247, 0.431497],
  [0.366529, 0.071579, 0.431994],
  [0.372768, 0.073915, 0.4324],
  [0.379001, 0.076253, 0.432719],
  [0.385228, 0.078591, 0.432955],
  [0.391453, 0.080927, 0.433109],
  [0.397674, 0.083257, 0.433183],
  [0.403894, 0.08558, 0.433179],
  [0.410113, 0.087896, 0.433098],
  [0.416331, 0.090203, 0.432943],
  [0.422549, 0.092501, 0.432714],
  [0.428768, 0.09479, 0.432412],
  [0.434987, 0.097069, 0.432039],
  [0.441207, 0.099338, 0.431594],
  [0.447428, 0.101597, 0.43108],
  [0.453651, 0.103848, 0.430498],
  [0.459875, 0.106089, 0.429846],
  [0.4661, 0.108322, 0.429125],
  [0.472328, 0.110547, 0.428334],
  [0.478558, 0.112764, 0.427475],
  [0.484789, 0.114974, 0.426548],
  [0.491022, 0.117179, 0.425552],
  [0.497257, 0.119379, 0.424488],
  [0.503493, 0.121575, 0.423356],
  [0.50973, 0.123769, 0.422156],
  [0.515967, 0.12596, 0.420887],
  [0.522206, 0.12815, 0.419549],
  [0.528444, 0.130341, 0.418142],
  [0.534683, 0.132534, 0.416667],
  [0.54092, 0.134729, 0.415123],
  [0.547157, 0.136929, 0.413511],
  [0.553392, 0.139134, 0.411829],
  [0.559624, 0.141346, 0.410078],
  [0.565854, 0.143567, 0.408258],
  [0.572081, 0.145797, 0.406369],
  [0.578304, 0.148039, 0.404411],
  [0.584521, 0.150294, 0.402385],
  [0.590734, 0.152563, 0.40029],
  [0.59694, 0.154848, 0.398125],
  [0.603139, 0.157151, 0.395891],
  [0.60933, 0.159474, 0.393589],
  [0.615513, 0.161817, 0.391219],
  [0.621685, 0.164184, 0.388781],
  [0.627847, 0.166575, 0.386276],
  [0.633998, 0.168992, 0.383704],
  [0.640135, 0.171438, 0.381065],
  [0.64626, 0.173914, 0.378359],
  [0.652369, 0.176421, 0.375586],
  [0.658463, 0.178962, 0.372748],
  [0.66454, 0.181539, 0.369846],
  [0.670599, 0.184153, 0.366879],
  [0.676638, 0.186807, 0.363849],
  [0.682656, 0.189501, 0.360757],
  [0.688653, 0.192239, 0.357603],
  [0.694627, 0.195021, 0.354388],
  [0.700576, 0.197851, 0.351113],
  [0.7065, 0.200728, 0.347777],
  [0.712396, 0.203656, 0.344383],
  [0.718264, 0.206636, 0.340931],
  [0.724103, 0.20967, 0.337424],
  [0.729909, 0.212759, 0.333861],
  [0.735683, 0.215906, 0.330245],
  [0.741423, 0.219112, 0.326576],
  [0.747127, 0.222378, 0.322856],
  [0.752794, 0.225706, 0.319085],
  [0.758422, 0.229097, 0.315266],
  [0.76401, 0.232554, 0.311399],
  [0.769556, 0.236077, 0.307485],
  [0.775059, 0.239667, 0.303526],
  [0.780517, 0.243327, 0.299523],
  [0.785929, 0.247056, 0.295477],
  [0.791293, 0.250856, 0.29139],
  [0.796607, 0.254728, 0.287264],
  [0.801871, 0.258674, 0.283099],
  [0.807082, 0.262692, 0.278898],
  [0.812239, 0.266786, 0.274661],
  [0.817341, 0.270954, 0.27039],
  [0.822386, 0.275197, 0.266085],
  [0.827372, 0.279517, 0.26175],
  [0.832299, 0.283913, 0.257383],
  [0.837165, 0.288385, 0.252988],
  [0.841969, 0.292933, 0.248564],
  [0.846709, 0.297559, 0.244113],
  [0.851384, 0.30226, 0.239636],
  [0.855992, 0.307038, 0.235133],
  [0.860533, 0.311892, 0.230606],
  [0.865006, 0.316822, 0.226055],
  [0.869409, 0.321827, 0.221482],
  [0.873741, 0.326906, 0.216886],
  [0.878001, 0.33206, 0.212268],
  [0.882188, 0.337287, 0.207628],
  [0.886302, 0.342586, 0.202968],
  [0.890341, 0.347957, 0.198286],
  [0.894305, 0.353399, 0.193584],
  [0.898192, 0.358911, 0.18886],
  [0.902003, 0.364492, 0.184116],
  [0.905735, 0.37014, 0.17935],
  [0.90939, 0.375856, 0.174563],
  [0.912966, 0.381636, 0.169755],
  [0.916462, 0.387481, 0.164924],
  [0.919879, 0.393389, 0.16007],
  [0.923215, 0.399359, 0.155193],
  [0.92647, 0.405389, 0.150292],
  [0.929644, 0.411479, 0.145367],
  [0.932737, 0.417627, 0.140417],
  [0.935747, 0.423831, 0.13544],
  [0.938675, 0.430091, 0.130438],
  [0.941521, 0.436405, 0.125409],
  [0.944285, 0.442772, 0.120354],
  [0.946965, 0.449191, 0.115272],
  [0.949562, 0.45566, 0.110164],
  [0.952075, 0.462178, 0.105031],
  [0.954506, 0.468744, 0.099874],
  [0.956852, 0.475356, 0.094695],
  [0.959114, 0.482014, 0.089499],
  [0.961293, 0.488716, 0.084289],
  [0.963387, 0.495462, 0.079073],
  [0.965397, 0.502249, 0.073859],
  [0.967322, 0.509078, 0.068659],
  [0.969163, 0.515946, 0.063488],
  [0.970919, 0.522853, 0.058367],
  [0.97259, 0.529798, 0.053324],
  [0.974176, 0.53678, 0.048392],
  [0.975677, 0.543798, 0.043618],
  [0.977092, 0.55085, 0.03905],
  [0.978422, 0.557937, 0.034931],
  [0.979666, 0.565057, 0.031409],
  [0.980824, 0.572209, 0.028508],
  [0.981895, 0.579392, 0.02625],
  [0.982881, 0.586606, 0.024661],
  [0.983779, 0.593849, 0.02377],
  [0.984591, 0.601122, 0.023606],
  [0.985315, 0.608422, 0.024202],
  [0.985952, 0.61575, 0.025592],
  [0.986502, 0.623105, 0.027814],
  [0.986964, 0.630485, 0.030908],
  [0.987337, 0.63789, 0.034916],
  [0.987622, 0.64532, 0.039886],
  [0.987819, 0.652773, 0.045581],
  [0.987926, 0.66025, 0.05175],
  [0.987945, 0.667748, 0.058329],
  [0.987874, 0.675267, 0.065257],
  [0.987714, 0.682807, 0.072489],
  [0.987464, 0.690366, 0.07999],
  [0.987124, 0.697944, 0.087731],
  [0.986694, 0.70554, 0.095694],
  [0.986175, 0.713153, 0.103863],
  [0.985566, 0.720782, 0.112229],
  [0.984865, 0.728427, 0.120785],
  [0.984075, 0.736087, 0.129527],
  [0.983196, 0.743758, 0.138453],
  [0.982228, 0.751442, 0.147565],
  [0.981173, 0.759135, 0.156863],
  [0.980032, 0.766837, 0.166353],
  [0.978806, 0.774545, 0.176037],
  [0.977497, 0.782258, 0.185923],
  [0.976108, 0.789974, 0.196018],
  [0.974638, 0.797692, 0.206332],
  [0.973088, 0.805409, 0.216877],
  [0.971468, 0.813122, 0.227658],
  [0.969783, 0.820825, 0.238686],
  [0.968041, 0.828515, 0.249972],
  [0.966243, 0.836191, 0.261534],
  [0.964394, 0.843848, 0.273391],
  [0.962517, 0.851476, 0.285546],
  [0.960626, 0.859069, 0.29801],
  [0.95872, 0.866624, 0.31082],
  [0.956834, 0.874129, 0.323974],
  [0.954997, 0.881569, 0.337475],
  [0.953215, 0.888942, 0.351369],
  [0.951546, 0.896226, 0.365627],
  [0.950018, 0.903409, 0.380271],
  [0.948683, 0.910473, 0.395289],
  [0.947594, 0.917399, 0.410665],
  [0.946809, 0.924168, 0.426373],
  [0.946392, 0.930761, 0.442367],
  [0.946403, 0.937159, 0.458592],
  [0.946903, 0.943348, 0.47497],
  [0.947937, 0.949318, 0.491426],
  [0.949545, 0.955063, 0.50786],
  [0.95174, 0.960587, 0.524203],
  [0.954529, 0.965896, 0.540361],
  [0.957896, 0.971003, 0.556275],
  [0.961812, 0.975924, 0.571925],
  [0.966249, 0.980678, 0.587206],
  [0.971162, 0.985282, 0.602154],
  [0.976511, 0.989753, 0.61676],
  [0.982257, 0.994109, 0.631017],
  [0.988362, 0.998364, 0.644924]
];

// build/src/core/Network.js
var Node = class {
  constructor(originalObject, ID, index, network) {
    for (const [nodeProperty, value] of Object.entries(originalObject)) {
      if (nodeProperty == "color" || nodeProperty == "size" || nodeProperty == "position" || nodeProperty == "outlineColor" || nodeProperty == "outlineWidth") {
        continue;
      }
      this[nodeProperty] = value;
    }
    this._network = network;
    this.ID = ID;
    this.index = index;
  }
  set color(newColor) {
    let nodeIndex = this.index;
    this._network.colors[nodeIndex * 4 + 0] = newColor[0];
    this._network.colors[nodeIndex * 4 + 1] = newColor[1];
    this._network.colors[nodeIndex * 4 + 2] = newColor[2];
    if (newColor.length > 3) {
      this._network.colors[nodeIndex * 4 + 3] = newColor[3];
    }
  }
  get color() {
    let nodeIndex = this.index;
    return [this._network.colors[nodeIndex * 4 + 0], this._network.colors[nodeIndex * 4 + 1], this._network.colors[nodeIndex * 4 + 2], this._network.colors[nodeIndex * 4 + 3]];
  }
  set size(newSize) {
    this._network.sizes[this.index] = newSize;
  }
  get size() {
    return this._network.sizes[this.index];
  }
  set outlineColor(newColor) {
    let nodeIndex = this.index;
    this._network.outlineColors[nodeIndex * 4 + 0] = newColor[0];
    this._network.outlineColors[nodeIndex * 4 + 1] = newColor[1];
    this._network.outlineColors[nodeIndex * 4 + 2] = newColor[2];
    if (newColor.length > 3) {
      this._network.outlineColors[nodeIndex * 4 + 3] = newColor[3];
    }
  }
  get outlineColor() {
    let nodeIndex = this.index;
    return [this._network.outlineColors[nodeIndex * 4 + 0], this._network.outlineColors[nodeIndex * 4 + 1], this._network.outlineColors[nodeIndex * 4 + 2], this._network.outlineColors[nodeIndex * 4 + 3]];
  }
  set outlineWidth(newWidth) {
    this._network.outlineWidths[this.index] = newWidth;
  }
  get outlineWidth() {
    return this._network.outlineWidths[this.index];
  }
  get network() {
    return this._network;
  }
  set position(newPosition) {
    let nodeIndex = this.index;
    this._network.positions[nodeIndex * 3 + 0] = newPosition[0];
    this._network.positions[nodeIndex * 3 + 1] = newPosition[1];
    this._network.positions[nodeIndex * 3 + 2] = newPosition[2];
  }
  get position() {
    let nodeIndex = this.index;
    return [this._network.positions[nodeIndex * 3 + 0], this._network.positions[nodeIndex * 3 + 1], this._network.positions[nodeIndex * 3 + 2]];
  }
};
var Network = class {
  constructor(nodes, edges, properties) {
    this.ID2index = new Object();
    this.index2Node = [];
    for (const [nodeID, node] of Object.entries(nodes)) {
      if (!this.ID2index.hasOwnProperty(nodeID)) {
        let nodeIndex = this.index2Node.length;
        this.ID2index[nodeID] = nodeIndex;
        node.index = nodeIndex;
        node.ID = nodeID;
        this.index2Node.push(node);
      }
    }
    this.indexedEdges = new Int32Array(edges.length * 2);
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
      const edge = edges[edgeIndex];
      this.indexedEdges[edgeIndex * 2] = this.ID2index[edge.source];
      this.indexedEdges[edgeIndex * 2 + 1] = this.ID2index[edge.target];
    }
    this.positions = new Float32Array(3 * this.index2Node.length);
    this.colors = new Float32Array(4 * this.index2Node.length);
    this.sizes = new Float32Array(this.index2Node.length);
    this.outlineColors = new Float32Array(4 * this.index2Node.length);
    for (let nodeIndex = 0; nodeIndex < this.index2Node.length; nodeIndex++) {
      this.colors[nodeIndex * 4 + 3] = 1;
      this.outlineColors[nodeIndex * 4 + 3] = 1;
    }
    this.outlineWidths = new Float32Array(this.index2Node.length);
    this.edgePositions = null;
    this.edgeColors = null;
    this.edgeSizes = null;
    this.nodes = {};
    let colorScale = linearScale([0, this.index2Node.length], [0, 1]);
    let colorMap = createColorMap(colors$2, colorScale);
    for (let index = 0; index < this.index2Node.length; index++) {
      let node = this.index2Node[index];
      if (node.hasOwnProperty("position")) {
        this.positions[index * 3] = node["position"][0];
        this.positions[index * 3 + 1] = node["position"][1];
        this.positions[index * 3 + 2] = node["position"][2];
      } else {
        this.positions[index * 3 + 0] = (Math.random() - 0.5) * 2 * 200;
        this.positions[index * 3 + 1] = (Math.random() - 0.5) * 2 * 200;
        this.positions[index * 3 + 2] = (Math.random() - 0.5) * 2 * 200;
      }
      if (node.hasOwnProperty("color")) {
        if (index == 0) {
          console.log("NODE COLOR:", node["color"]);
        }
        this.colors[index * 4 + 0] = node["color"][0];
        this.colors[index * 4 + 1] = node["color"][1];
        this.colors[index * 4 + 2] = node["color"][2];
        if (node["color"].length > 3) {
          this.colors[index * 4 + 3] = node["color"][3];
        } else {
          this.colors[index * 4 + 3] = 1;
        }
      } else {
        let color2 = colorMap(index);
        this.colors[index * 4 + 0] = color2[0];
        this.colors[index * 4 + 1] = color2[1];
        this.colors[index * 4 + 2] = color2[2];
        if (color2.length > 3) {
          this.colors[index * 4 + 3] = color2[3];
        } else {
          this.colors[index * 4 + 3] = 1;
        }
      }
      if (node.hasOwnProperty("size")) {
        this.sizes[index] = node["size"];
      } else {
        this.sizes[index] = 1;
      }
      if (node.hasOwnProperty("outlineColor")) {
        this.outlineColors[index * 4 + 0] = node["outlineColor"][0];
        this.outlineColors[index * 4 + 1] = node["outlineColor"][1];
        this.outlineColors[index * 4 + 2] = node["outlineColor"][2];
        if (node["outlineColor"].length > 3) {
          this.outlineColors[index * 4 + 3] = node["outlineColor"][3];
        } else {
          this.outlineColors[index * 4 + 3] = 1;
        }
      } else {
        this.outlineColors[index * 4 + 0] = 1;
        this.outlineColors[index * 4 + 1] = 1;
        this.outlineColors[index * 4 + 2] = 1;
        this.outlineColors[index * 4 + 3] = 1;
      }
      if (node.hasOwnProperty("outlineWidth")) {
        this.outlineWidths[index] = node["outlineWidth"];
      } else {
        this.outlineWidths[index] = 0;
      }
      let newNode = new Node(node, node.ID, index, this);
      this.index2Node[index] = newNode;
      this.nodes[node.ID] = newNode;
    }
  }
  get nodeCount() {
    return this.index2Node.length;
  }
  updateEdgePositions() {
    if (this.edgePositions == null) {
      this.edgePositions = new Float32Array(3 * this.indexedEdges.length);
    }
    for (let edgeIndex = 0; edgeIndex < this.indexedEdges.length / 2; edgeIndex++) {
      let fromIndex = this.indexedEdges[edgeIndex * 2];
      let toIndex = this.indexedEdges[edgeIndex * 2 + 1];
      this.edgePositions[edgeIndex * 2 * 3] = this.positions[fromIndex * 3];
      this.edgePositions[edgeIndex * 2 * 3 + 1] = this.positions[fromIndex * 3 + 1];
      this.edgePositions[edgeIndex * 2 * 3 + 2] = this.positions[fromIndex * 3 + 2];
      this.edgePositions[(edgeIndex * 2 + 1) * 3] = this.positions[toIndex * 3];
      this.edgePositions[(edgeIndex * 2 + 1) * 3 + 1] = this.positions[toIndex * 3 + 1];
      this.edgePositions[(edgeIndex * 2 + 1) * 3 + 2] = this.positions[toIndex * 3 + 2];
    }
  }
  updateEdgeColors(updateOpacity) {
    if (this.edgeColors == null) {
      this.edgeColors = new Float32Array(4 * this.indexedEdges.length);
    }
    if (typeof updateOpacity === "undefined") {
      updateOpacity = true;
    }
    for (let edgeIndex = 0; edgeIndex < this.indexedEdges.length / 2; edgeIndex++) {
      let fromIndex = this.indexedEdges[edgeIndex * 2];
      let toIndex = this.indexedEdges[edgeIndex * 2 + 1];
      this.edgeColors[edgeIndex * 2 * 4] = this.colors[fromIndex * 4];
      this.edgeColors[edgeIndex * 2 * 4 + 1] = this.colors[fromIndex * 4 + 1];
      this.edgeColors[edgeIndex * 2 * 4 + 2] = this.colors[fromIndex * 4 + 2];
      this.edgeColors[(edgeIndex * 2 + 1) * 4] = this.colors[toIndex * 4];
      this.edgeColors[(edgeIndex * 2 + 1) * 4 + 1] = this.colors[toIndex * 4 + 1];
      this.edgeColors[(edgeIndex * 2 + 1) * 4 + 2] = this.colors[toIndex * 4 + 2];
      if (updateOpacity) {
        this.edgeColors[edgeIndex * 2 * 4 + 3] = this.colors[fromIndex * 4 + 3];
        this.edgeColors[(edgeIndex * 2 + 1) * 4 + 3] = this.colors[toIndex * 4 + 3];
      }
    }
  }
  updateEdgeSizes() {
    if (this.edgeSizes == null) {
      this.edgeSizes = new Float32Array(this.indexedEdges.length);
    }
    for (let edgeIndex = 0; edgeIndex < this.indexedEdges.length / 2; edgeIndex++) {
      let fromIndex = this.indexedEdges[edgeIndex * 2];
      let toIndex = this.indexedEdges[edgeIndex * 2 + 1];
      this.edgeSizes[edgeIndex * 2] = this.sizes[fromIndex];
      this.edgeSizes[edgeIndex * 2 + 1] = this.sizes[toIndex];
    }
  }
  updateEdgeOpacity(updateOpacity) {
    if (this.edgeColors == null) {
      this.edgeColors = new Float32Array(4 * this.indexedEdges.length);
    }
    for (let edgeIndex = 0; edgeIndex < this.indexedEdges.length / 2; edgeIndex++) {
      let fromIndex = this.indexedEdges[edgeIndex * 2];
      let toIndex = this.indexedEdges[edgeIndex * 2 + 1];
      this.edgeColors[edgeIndex * 2 * 4 + 3] = this.colors[fromIndex * 4 + 3];
      this.edgeColors[(edgeIndex * 2 + 1) * 4 + 3] = this.colors[toIndex * 4 + 3];
    }
  }
};

// build/src/utils/webglutils.js
import.meta.env = env_exports;
var requestAnimationFrame2 = function() {
  return window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function(callback, element) {
    return window.setTimeout(callback, 1e3 / 60);
  };
}();
var cancelAnimationFrame2 = window.cancelAnimationFrame || window.mozCancelAnimationFrame;
function createWebGLContext(canvas, opt_attribs) {
  let names = ["webgl", "experimental-webgl", "webkit-3d", "moz-webgl"];
  let context = null;
  for (let ii = 0; ii < names.length; ++ii) {
    try {
      context = canvas.getContext(names[ii], opt_attribs);
    } catch (e) {
    }
    if (context) {
      break;
    }
  }
  return context;
}
function getShaderFromString(gl, str, type) {
  let shader;
  shader = gl.createShader(type);
  gl.shaderSource(shader, str);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.log("ERROR with script: ", str);
    console.log(gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}
function ShaderProgram(vertexShader3, fragmentShader3, uniforms, attributes, glContext) {
  let shaderProgram = glContext.createProgram();
  glContext.attachShader(shaderProgram, vertexShader3);
  glContext.attachShader(shaderProgram, fragmentShader3);
  glContext.linkProgram(shaderProgram);
  if (!glContext.getProgramParameter(shaderProgram, glContext.LINK_STATUS)) {
    alert("Shader Compilation Error." + glContext.getProgramInfoLog(shaderProgram));
    return;
  }
  this.ID = shaderProgram;
  this.uniforms = new Object();
  this.attributes = new Object();
  if (uniforms) {
    for (let i = 0; i < uniforms.length; i++) {
      this.uniforms[uniforms[i]] = glContext.getUniformLocation(this.ID, uniforms[i]);
    }
  }
  this.attributes.enable = function(attributeName) {
    glContext.enableVertexAttribArray(this[attributeName]);
  };
  this.attributes.disable = function(attributeName) {
    glContext.disableVertexAttribArray(this[attributeName]);
  };
  if (attributes) {
    for (let i = 0; i < attributes.length; i++) {
      this.attributes[attributes[i]] = glContext.getAttribLocation(this.ID, attributes[i]);
    }
  }
  this.use = function(glContext2) {
    glContext2.useProgram(this.ID);
  };
}
function makePlane(ctx, generateNormal = true, generateTexCoord = true) {
  let geometryData = [
    -1,
    1,
    0,
    -1,
    -1,
    0,
    1,
    1,
    0,
    1,
    -1,
    0
  ];
  let normalData = [
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1,
    0,
    0,
    1
  ];
  let texCoordData = [
    0,
    1,
    0,
    1,
    0,
    0,
    1,
    1,
    0,
    0,
    0,
    0
  ];
  let retval = {};
  if (generateTexCoord) {
    retval.texCoordObject = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, retval.texCoordObject);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(texCoordData), ctx.STATIC_DRAW);
  }
  if (generateNormal) {
    retval.normalObject = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, retval.normalObject);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(normalData), ctx.STATIC_DRAW);
  }
  retval.vertexObject = ctx.createBuffer();
  ctx.bindBuffer(ctx.ARRAY_BUFFER, retval.vertexObject);
  ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(geometryData), ctx.STATIC_DRAW);
  retval.numIndices = 4;
  return retval;
}
function degToRad(degrees2) {
  return degrees2 * Math.PI / 180;
}

// build/src/utils/xnet.js
var xnet_exports = {};
__export(xnet_exports, {
  loadXNET: () => loadXNET,
  loadXNETFile: () => loadXNETFile
});
"use strict";
var textSplit2 = (text) => {
  let entries = text.split(/\s/);
  if (entries.length < 2) {
    return null;
  }
  return [+entries[0], +entries[1]];
};
var textSplit3 = (text) => {
  let entries = text.split(/\s/);
  if (entries.length < 3) {
    return null;
  }
  return [+entries[0], +entries[1], +entries[2]];
};
var readNumberIgnoringNone = (text) => {
  if (isNaN(text)) {
    return 0;
  } else {
    return +text;
  }
};
var propertyHeaderRegular = /#([ve]) \"(.+)\" ([sn]|v2|v3)/;
var propertyFunctions = {
  s: String,
  n: readNumberIgnoringNone,
  v2: textSplit2,
  v3: textSplit3
};
var readXNETVerticesHeader = (status) => {
  while (status.lineIndex + 1 < status.lines.length && status.lines[status.lineIndex].length == 0) {
    status.lineIndex++;
  }
  let headerLine = status.lines[status.lineIndex];
  let headerEntries = headerLine.split(/\s/);
  let nodeCount = 0;
  if (headerEntries.length == 0 || headerEntries[0].toLowerCase() != "#vertices" || isNaN(headerEntries[1]) || !Number.isInteger(+headerEntries[1])) {
    throw `Malformed xnet data (Reading Vertices Header)[line: ${status.lineIndex}]
	> ${status.lines[status.lineIndex]}`;
  }
  nodeCount = +headerEntries[1];
  status.lineIndex++;
  return nodeCount;
};
var readXNETLabels = (status) => {
  let labels = [];
  while (status.lineIndex < status.lines.length) {
    let currentLine = status.lines[status.lineIndex];
    let lineLength = currentLine.length;
    if (lineLength == 0) {
      status.lineIndex++;
      continue;
    }
    if (currentLine[0] == "#") {
      break;
    }
    var label = currentLine;
    if (currentLine[0] == '"' && currentLine[lineLength - 1] == '"') {
      label = currentLine.slice(1, -1);
    }
    labels.push(label);
    status.lineIndex++;
  }
  return labels;
};
var readXNETEdgesHeader = (status) => {
  while (status.lineIndex + 1 < status.lines.length && status.lines[status.lineIndex].length == 0) {
    status.lineIndex++;
  }
  let headerLine = status.lines[status.lineIndex];
  let headerEntries = headerLine.split(/\s/);
  let weighted = false;
  let directed = false;
  if (headerEntries.length == 0 || headerEntries[0].toLowerCase() != "#edges") {
    throw `Malformed xnet data (Reading Edges Header)[line: ${status.lineIndex}]
	> ${status.lines[status.lineIndex]}`;
  }
  headerEntries.forEach((headerEntry) => {
    if (headerEntry.toLowerCase() == "weighted") {
      weighted = true;
    }
    if (headerEntry.toLowerCase() == "nonweighted") {
      weighted = false;
    }
    if (headerEntry.toLowerCase() == "directed") {
      directed = true;
    }
    if (headerEntry.toLowerCase() == "undirected") {
      directed = false;
    }
  });
  status.lineIndex++;
  return {weighted, directed};
};
var readXNETEdges = (status) => {
  let edges = [];
  let weights = [];
  while (status.lineIndex < status.lines.length) {
    let currentLine = status.lines[status.lineIndex];
    let lineLength = currentLine.length;
    if (lineLength == 0) {
      status.lineIndex++;
      continue;
    }
    if (currentLine[0] == "#") {
      break;
    }
    let entries = currentLine.split(/\s/);
    let weight = 1;
    if (entries.length < 2) {
      throw `Malformed xnet data (Reading Edges)[line: ${status.lineIndex}]
	> ${status.lines[status.lineIndex]}`;
    }
    if (entries.length > 2) {
      weight = +entries[2];
    }
    edges.push([+entries[0], +entries[1]]);
    weights.push(weight);
    status.lineIndex++;
  }
  return {edges, weights};
};
var readXNETPropertyHeader = (status) => {
  while (status.lineIndex + 1 < status.lines.length && status.lines[status.lineIndex].length == 0) {
    status.lineIndex++;
  }
  let headerEntries = propertyHeaderRegular.exec(status.lines[status.lineIndex]);
  if (headerEntries.length != 4) {
    throw `Malformed xnet data [line: ${status.lineIndex}]
	> ${status.lines[status.lineIndex]}`;
  }
  let propertyType = headerEntries[1];
  let propertyKey = headerEntries[2];
  let propertyFormat = headerEntries[3];
  status.lineIndex++;
  return {type: propertyType, key: propertyKey, format: propertyFormat};
};
var readXNETProperty = (status, propertyHeader) => {
  let properties = [];
  let propertyFunction2 = propertyFunctions[propertyHeader.format];
  while (status.lineIndex < status.lines.length) {
    let currentLine = status.lines[status.lineIndex];
    let lineLength = currentLine.length;
    if (lineLength == 0) {
      status.lineIndex++;
      continue;
    }
    if (currentLine[0] == "#") {
      break;
    }
    let value = currentLine;
    if (value[0] == '"' && value[lineLength - 1] == '"') {
      value = value.slice(1, -1);
    }
    properties.push(propertyFunction2(value));
    status.lineIndex++;
  }
  return properties;
};
var loadXNET = (data) => {
  let status = {lineIndex: 0, lines: data.split("\n")};
  let nodesCount = readXNETVerticesHeader(status);
  let labels = readXNETLabels(status);
  let network = {nodesCount, verticesProperties: {}, edgesProperties: {}};
  if (labels.length > 0) {
    if (labels.length < nodesCount) {
      throw `Malformed xnet data [line: ${status.lineIndex}]
	> ${status.lines[status.lineIndex]}`;
    } else {
      network.labels = labels;
    }
  }
  let edgesHeader = readXNETEdgesHeader(status);
  network.directed = edgesHeader.directed;
  network.weighted = edgesHeader.weighted;
  let edgesData = readXNETEdges(status);
  network.edges = edgesData.edges;
  if (network.weighted) {
    network.weights = edgesData.weights;
  }
  do {
    while (status.lineIndex < status.lines.length && status.lines[status.lineIndex].length == 0) {
      status.lineIndex++;
    }
    if (!(status.lineIndex < status.lines.length)) {
      break;
    }
    let propertyHeader = readXNETPropertyHeader(status);
    let propertyData = readXNETProperty(status, propertyHeader);
    if (propertyHeader.type == "e") {
      network.edgesProperties[propertyHeader.key] = propertyData;
    } else if (propertyHeader.type == "v") {
      network.verticesProperties[propertyHeader.key] = propertyData;
    }
  } while (status.lineIndex < status.lines.length);
  return network;
};
async function loadXNETFile(networkFile) {
  let networkData = await fetch(networkFile).then((response) => response.text());
  return loadXNET(networkData);
}

// build/_snowpack/pkg/common/select-9bda5bb9.js
var xhtml = "http://www.w3.org/1999/xhtml";
var namespaces = {
  svg: "http://www.w3.org/2000/svg",
  xhtml,
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace",
  xmlns: "http://www.w3.org/2000/xmlns/"
};
function namespace(name) {
  var prefix = name += "", i = prefix.indexOf(":");
  if (i >= 0 && (prefix = name.slice(0, i)) !== "xmlns")
    name = name.slice(i + 1);
  return namespaces.hasOwnProperty(prefix) ? {space: namespaces[prefix], local: name} : name;
}
function creatorInherit(name) {
  return function() {
    var document2 = this.ownerDocument, uri = this.namespaceURI;
    return uri === xhtml && document2.documentElement.namespaceURI === xhtml ? document2.createElement(name) : document2.createElementNS(uri, name);
  };
}
function creatorFixed(fullname) {
  return function() {
    return this.ownerDocument.createElementNS(fullname.space, fullname.local);
  };
}
function creator(name) {
  var fullname = namespace(name);
  return (fullname.local ? creatorFixed : creatorInherit)(fullname);
}
function none() {
}
function selector(selector2) {
  return selector2 == null ? none : function() {
    return this.querySelector(selector2);
  };
}
function selection_select(select2) {
  if (typeof select2 !== "function")
    select2 = selector(select2);
  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) {
      if ((node = group[i]) && (subnode = select2.call(node, node.__data__, i, group))) {
        if ("__data__" in node)
          subnode.__data__ = node.__data__;
        subgroup[i] = subnode;
      }
    }
  }
  return new Selection(subgroups, this._parents);
}
function array(x) {
  return x == null ? [] : Array.isArray(x) ? x : Array.from(x);
}
function empty() {
  return [];
}
function selectorAll(selector2) {
  return selector2 == null ? empty : function() {
    return this.querySelectorAll(selector2);
  };
}
function arrayAll(select2) {
  return function() {
    return array(select2.apply(this, arguments));
  };
}
function selection_selectAll(select2) {
  if (typeof select2 === "function")
    select2 = arrayAll(select2);
  else
    select2 = selectorAll(select2);
  for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        subgroups.push(select2.call(node, node.__data__, i, group));
        parents.push(node);
      }
    }
  }
  return new Selection(subgroups, parents);
}
function matcher(selector2) {
  return function() {
    return this.matches(selector2);
  };
}
function childMatcher(selector2) {
  return function(node) {
    return node.matches(selector2);
  };
}
var find = Array.prototype.find;
function childFind(match) {
  return function() {
    return find.call(this.children, match);
  };
}
function childFirst() {
  return this.firstElementChild;
}
function selection_selectChild(match) {
  return this.select(match == null ? childFirst : childFind(typeof match === "function" ? match : childMatcher(match)));
}
var filter = Array.prototype.filter;
function children() {
  return Array.from(this.children);
}
function childrenFilter(match) {
  return function() {
    return filter.call(this.children, match);
  };
}
function selection_selectChildren(match) {
  return this.selectAll(match == null ? children : childrenFilter(typeof match === "function" ? match : childMatcher(match)));
}
function selection_filter(match) {
  if (typeof match !== "function")
    match = matcher(match);
  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) {
      if ((node = group[i]) && match.call(node, node.__data__, i, group)) {
        subgroup.push(node);
      }
    }
  }
  return new Selection(subgroups, this._parents);
}
function sparse(update) {
  return new Array(update.length);
}
function selection_enter() {
  return new Selection(this._enter || this._groups.map(sparse), this._parents);
}
function EnterNode(parent, datum2) {
  this.ownerDocument = parent.ownerDocument;
  this.namespaceURI = parent.namespaceURI;
  this._next = null;
  this._parent = parent;
  this.__data__ = datum2;
}
EnterNode.prototype = {
  constructor: EnterNode,
  appendChild: function(child) {
    return this._parent.insertBefore(child, this._next);
  },
  insertBefore: function(child, next) {
    return this._parent.insertBefore(child, next);
  },
  querySelector: function(selector2) {
    return this._parent.querySelector(selector2);
  },
  querySelectorAll: function(selector2) {
    return this._parent.querySelectorAll(selector2);
  }
};
function constant(x) {
  return function() {
    return x;
  };
}
function bindIndex(parent, group, enter, update, exit, data) {
  var i = 0, node, groupLength = group.length, dataLength = data.length;
  for (; i < dataLength; ++i) {
    if (node = group[i]) {
      node.__data__ = data[i];
      update[i] = node;
    } else {
      enter[i] = new EnterNode(parent, data[i]);
    }
  }
  for (; i < groupLength; ++i) {
    if (node = group[i]) {
      exit[i] = node;
    }
  }
}
function bindKey(parent, group, enter, update, exit, data, key) {
  var i, node, nodeByKeyValue = new Map(), groupLength = group.length, dataLength = data.length, keyValues = new Array(groupLength), keyValue;
  for (i = 0; i < groupLength; ++i) {
    if (node = group[i]) {
      keyValues[i] = keyValue = key.call(node, node.__data__, i, group) + "";
      if (nodeByKeyValue.has(keyValue)) {
        exit[i] = node;
      } else {
        nodeByKeyValue.set(keyValue, node);
      }
    }
  }
  for (i = 0; i < dataLength; ++i) {
    keyValue = key.call(parent, data[i], i, data) + "";
    if (node = nodeByKeyValue.get(keyValue)) {
      update[i] = node;
      node.__data__ = data[i];
      nodeByKeyValue.delete(keyValue);
    } else {
      enter[i] = new EnterNode(parent, data[i]);
    }
  }
  for (i = 0; i < groupLength; ++i) {
    if ((node = group[i]) && nodeByKeyValue.get(keyValues[i]) === node) {
      exit[i] = node;
    }
  }
}
function datum(node) {
  return node.__data__;
}
function selection_data(value, key) {
  if (!arguments.length)
    return Array.from(this, datum);
  var bind = key ? bindKey : bindIndex, parents = this._parents, groups = this._groups;
  if (typeof value !== "function")
    value = constant(value);
  for (var m = groups.length, update = new Array(m), enter = new Array(m), exit = new Array(m), j = 0; j < m; ++j) {
    var parent = parents[j], group = groups[j], groupLength = group.length, data = arraylike(value.call(parent, parent && parent.__data__, j, parents)), dataLength = data.length, enterGroup = enter[j] = new Array(dataLength), updateGroup = update[j] = new Array(dataLength), exitGroup = exit[j] = new Array(groupLength);
    bind(parent, group, enterGroup, updateGroup, exitGroup, data, key);
    for (var i0 = 0, i1 = 0, previous, next; i0 < dataLength; ++i0) {
      if (previous = enterGroup[i0]) {
        if (i0 >= i1)
          i1 = i0 + 1;
        while (!(next = updateGroup[i1]) && ++i1 < dataLength)
          ;
        previous._next = next || null;
      }
    }
  }
  update = new Selection(update, parents);
  update._enter = enter;
  update._exit = exit;
  return update;
}
function arraylike(data) {
  return typeof data === "object" && "length" in data ? data : Array.from(data);
}
function selection_exit() {
  return new Selection(this._exit || this._groups.map(sparse), this._parents);
}
function selection_join(onenter, onupdate, onexit) {
  var enter = this.enter(), update = this, exit = this.exit();
  if (typeof onenter === "function") {
    enter = onenter(enter);
    if (enter)
      enter = enter.selection();
  } else {
    enter = enter.append(onenter + "");
  }
  if (onupdate != null) {
    update = onupdate(update);
    if (update)
      update = update.selection();
  }
  if (onexit == null)
    exit.remove();
  else
    onexit(exit);
  return enter && update ? enter.merge(update).order() : update;
}
function selection_merge(context) {
  var selection2 = context.selection ? context.selection() : context;
  for (var groups0 = this._groups, groups1 = selection2._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j) {
    for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i) {
      if (node = group0[i] || group1[i]) {
        merge[i] = node;
      }
    }
  }
  for (; j < m0; ++j) {
    merges[j] = groups0[j];
  }
  return new Selection(merges, this._parents);
}
function selection_order() {
  for (var groups = this._groups, j = -1, m = groups.length; ++j < m; ) {
    for (var group = groups[j], i = group.length - 1, next = group[i], node; --i >= 0; ) {
      if (node = group[i]) {
        if (next && node.compareDocumentPosition(next) ^ 4)
          next.parentNode.insertBefore(node, next);
        next = node;
      }
    }
  }
  return this;
}
function selection_sort(compare) {
  if (!compare)
    compare = ascending;
  function compareNode(a, b) {
    return a && b ? compare(a.__data__, b.__data__) : !a - !b;
  }
  for (var groups = this._groups, m = groups.length, sortgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, sortgroup = sortgroups[j] = new Array(n), node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        sortgroup[i] = node;
      }
    }
    sortgroup.sort(compareNode);
  }
  return new Selection(sortgroups, this._parents).order();
}
function ascending(a, b) {
  return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
}
function selection_call() {
  var callback = arguments[0];
  arguments[0] = this;
  callback.apply(null, arguments);
  return this;
}
function selection_nodes() {
  return Array.from(this);
}
function selection_node() {
  for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
    for (var group = groups[j], i = 0, n = group.length; i < n; ++i) {
      var node = group[i];
      if (node)
        return node;
    }
  }
  return null;
}
function selection_size() {
  let size = 0;
  for (const node of this)
    ++size;
  return size;
}
function selection_empty() {
  return !this.node();
}
function selection_each(callback) {
  for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
    for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
      if (node = group[i])
        callback.call(node, node.__data__, i, group);
    }
  }
  return this;
}
function attrRemove(name) {
  return function() {
    this.removeAttribute(name);
  };
}
function attrRemoveNS(fullname) {
  return function() {
    this.removeAttributeNS(fullname.space, fullname.local);
  };
}
function attrConstant(name, value) {
  return function() {
    this.setAttribute(name, value);
  };
}
function attrConstantNS(fullname, value) {
  return function() {
    this.setAttributeNS(fullname.space, fullname.local, value);
  };
}
function attrFunction(name, value) {
  return function() {
    var v = value.apply(this, arguments);
    if (v == null)
      this.removeAttribute(name);
    else
      this.setAttribute(name, v);
  };
}
function attrFunctionNS(fullname, value) {
  return function() {
    var v = value.apply(this, arguments);
    if (v == null)
      this.removeAttributeNS(fullname.space, fullname.local);
    else
      this.setAttributeNS(fullname.space, fullname.local, v);
  };
}
function selection_attr(name, value) {
  var fullname = namespace(name);
  if (arguments.length < 2) {
    var node = this.node();
    return fullname.local ? node.getAttributeNS(fullname.space, fullname.local) : node.getAttribute(fullname);
  }
  return this.each((value == null ? fullname.local ? attrRemoveNS : attrRemove : typeof value === "function" ? fullname.local ? attrFunctionNS : attrFunction : fullname.local ? attrConstantNS : attrConstant)(fullname, value));
}
function defaultView(node) {
  return node.ownerDocument && node.ownerDocument.defaultView || node.document && node || node.defaultView;
}
function styleRemove(name) {
  return function() {
    this.style.removeProperty(name);
  };
}
function styleConstant(name, value, priority) {
  return function() {
    this.style.setProperty(name, value, priority);
  };
}
function styleFunction(name, value, priority) {
  return function() {
    var v = value.apply(this, arguments);
    if (v == null)
      this.style.removeProperty(name);
    else
      this.style.setProperty(name, v, priority);
  };
}
function selection_style(name, value, priority) {
  return arguments.length > 1 ? this.each((value == null ? styleRemove : typeof value === "function" ? styleFunction : styleConstant)(name, value, priority == null ? "" : priority)) : styleValue(this.node(), name);
}
function styleValue(node, name) {
  return node.style.getPropertyValue(name) || defaultView(node).getComputedStyle(node, null).getPropertyValue(name);
}
function propertyRemove(name) {
  return function() {
    delete this[name];
  };
}
function propertyConstant(name, value) {
  return function() {
    this[name] = value;
  };
}
function propertyFunction(name, value) {
  return function() {
    var v = value.apply(this, arguments);
    if (v == null)
      delete this[name];
    else
      this[name] = v;
  };
}
function selection_property(name, value) {
  return arguments.length > 1 ? this.each((value == null ? propertyRemove : typeof value === "function" ? propertyFunction : propertyConstant)(name, value)) : this.node()[name];
}
function classArray(string) {
  return string.trim().split(/^|\s+/);
}
function classList(node) {
  return node.classList || new ClassList(node);
}
function ClassList(node) {
  this._node = node;
  this._names = classArray(node.getAttribute("class") || "");
}
ClassList.prototype = {
  add: function(name) {
    var i = this._names.indexOf(name);
    if (i < 0) {
      this._names.push(name);
      this._node.setAttribute("class", this._names.join(" "));
    }
  },
  remove: function(name) {
    var i = this._names.indexOf(name);
    if (i >= 0) {
      this._names.splice(i, 1);
      this._node.setAttribute("class", this._names.join(" "));
    }
  },
  contains: function(name) {
    return this._names.indexOf(name) >= 0;
  }
};
function classedAdd(node, names) {
  var list = classList(node), i = -1, n = names.length;
  while (++i < n)
    list.add(names[i]);
}
function classedRemove(node, names) {
  var list = classList(node), i = -1, n = names.length;
  while (++i < n)
    list.remove(names[i]);
}
function classedTrue(names) {
  return function() {
    classedAdd(this, names);
  };
}
function classedFalse(names) {
  return function() {
    classedRemove(this, names);
  };
}
function classedFunction(names, value) {
  return function() {
    (value.apply(this, arguments) ? classedAdd : classedRemove)(this, names);
  };
}
function selection_classed(name, value) {
  var names = classArray(name + "");
  if (arguments.length < 2) {
    var list = classList(this.node()), i = -1, n = names.length;
    while (++i < n)
      if (!list.contains(names[i]))
        return false;
    return true;
  }
  return this.each((typeof value === "function" ? classedFunction : value ? classedTrue : classedFalse)(names, value));
}
function textRemove() {
  this.textContent = "";
}
function textConstant(value) {
  return function() {
    this.textContent = value;
  };
}
function textFunction(value) {
  return function() {
    var v = value.apply(this, arguments);
    this.textContent = v == null ? "" : v;
  };
}
function selection_text(value) {
  return arguments.length ? this.each(value == null ? textRemove : (typeof value === "function" ? textFunction : textConstant)(value)) : this.node().textContent;
}
function htmlRemove() {
  this.innerHTML = "";
}
function htmlConstant(value) {
  return function() {
    this.innerHTML = value;
  };
}
function htmlFunction(value) {
  return function() {
    var v = value.apply(this, arguments);
    this.innerHTML = v == null ? "" : v;
  };
}
function selection_html(value) {
  return arguments.length ? this.each(value == null ? htmlRemove : (typeof value === "function" ? htmlFunction : htmlConstant)(value)) : this.node().innerHTML;
}
function raise() {
  if (this.nextSibling)
    this.parentNode.appendChild(this);
}
function selection_raise() {
  return this.each(raise);
}
function lower() {
  if (this.previousSibling)
    this.parentNode.insertBefore(this, this.parentNode.firstChild);
}
function selection_lower() {
  return this.each(lower);
}
function selection_append(name) {
  var create2 = typeof name === "function" ? name : creator(name);
  return this.select(function() {
    return this.appendChild(create2.apply(this, arguments));
  });
}
function constantNull() {
  return null;
}
function selection_insert(name, before) {
  var create2 = typeof name === "function" ? name : creator(name), select2 = before == null ? constantNull : typeof before === "function" ? before : selector(before);
  return this.select(function() {
    return this.insertBefore(create2.apply(this, arguments), select2.apply(this, arguments) || null);
  });
}
function remove() {
  var parent = this.parentNode;
  if (parent)
    parent.removeChild(this);
}
function selection_remove() {
  return this.each(remove);
}
function selection_cloneShallow() {
  var clone = this.cloneNode(false), parent = this.parentNode;
  return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
}
function selection_cloneDeep() {
  var clone = this.cloneNode(true), parent = this.parentNode;
  return parent ? parent.insertBefore(clone, this.nextSibling) : clone;
}
function selection_clone(deep) {
  return this.select(deep ? selection_cloneDeep : selection_cloneShallow);
}
function selection_datum(value) {
  return arguments.length ? this.property("__data__", value) : this.node().__data__;
}
function contextListener(listener) {
  return function(event) {
    listener.call(this, event, this.__data__);
  };
}
function parseTypenames(typenames) {
  return typenames.trim().split(/^|\s+/).map(function(t) {
    var name = "", i = t.indexOf(".");
    if (i >= 0)
      name = t.slice(i + 1), t = t.slice(0, i);
    return {type: t, name};
  });
}
function onRemove(typename) {
  return function() {
    var on = this.__on;
    if (!on)
      return;
    for (var j = 0, i = -1, m = on.length, o; j < m; ++j) {
      if (o = on[j], (!typename.type || o.type === typename.type) && o.name === typename.name) {
        this.removeEventListener(o.type, o.listener, o.options);
      } else {
        on[++i] = o;
      }
    }
    if (++i)
      on.length = i;
    else
      delete this.__on;
  };
}
function onAdd(typename, value, options) {
  return function() {
    var on = this.__on, o, listener = contextListener(value);
    if (on)
      for (var j = 0, m = on.length; j < m; ++j) {
        if ((o = on[j]).type === typename.type && o.name === typename.name) {
          this.removeEventListener(o.type, o.listener, o.options);
          this.addEventListener(o.type, o.listener = listener, o.options = options);
          o.value = value;
          return;
        }
      }
    this.addEventListener(typename.type, listener, options);
    o = {type: typename.type, name: typename.name, value, listener, options};
    if (!on)
      this.__on = [o];
    else
      on.push(o);
  };
}
function selection_on(typename, value, options) {
  var typenames = parseTypenames(typename + ""), i, n = typenames.length, t;
  if (arguments.length < 2) {
    var on = this.node().__on;
    if (on)
      for (var j = 0, m = on.length, o; j < m; ++j) {
        for (i = 0, o = on[j]; i < n; ++i) {
          if ((t = typenames[i]).type === o.type && t.name === o.name) {
            return o.value;
          }
        }
      }
    return;
  }
  on = value ? onAdd : onRemove;
  for (i = 0; i < n; ++i)
    this.each(on(typenames[i], value, options));
  return this;
}
function dispatchEvent(node, type, params) {
  var window2 = defaultView(node), event = window2.CustomEvent;
  if (typeof event === "function") {
    event = new event(type, params);
  } else {
    event = window2.document.createEvent("Event");
    if (params)
      event.initEvent(type, params.bubbles, params.cancelable), event.detail = params.detail;
    else
      event.initEvent(type, false, false);
  }
  node.dispatchEvent(event);
}
function dispatchConstant(type, params) {
  return function() {
    return dispatchEvent(this, type, params);
  };
}
function dispatchFunction(type, params) {
  return function() {
    return dispatchEvent(this, type, params.apply(this, arguments));
  };
}
function selection_dispatch(type, params) {
  return this.each((typeof params === "function" ? dispatchFunction : dispatchConstant)(type, params));
}
function* selection_iterator() {
  for (var groups = this._groups, j = 0, m = groups.length; j < m; ++j) {
    for (var group = groups[j], i = 0, n = group.length, node; i < n; ++i) {
      if (node = group[i])
        yield node;
    }
  }
}
var root = [null];
function Selection(groups, parents) {
  this._groups = groups;
  this._parents = parents;
}
function selection() {
  return new Selection([[document.documentElement]], root);
}
function selection_selection() {
  return this;
}
Selection.prototype = selection.prototype = {
  constructor: Selection,
  select: selection_select,
  selectAll: selection_selectAll,
  selectChild: selection_selectChild,
  selectChildren: selection_selectChildren,
  filter: selection_filter,
  data: selection_data,
  enter: selection_enter,
  exit: selection_exit,
  join: selection_join,
  merge: selection_merge,
  selection: selection_selection,
  order: selection_order,
  sort: selection_sort,
  call: selection_call,
  nodes: selection_nodes,
  node: selection_node,
  size: selection_size,
  empty: selection_empty,
  each: selection_each,
  attr: selection_attr,
  style: selection_style,
  property: selection_property,
  classed: selection_classed,
  text: selection_text,
  html: selection_html,
  raise: selection_raise,
  lower: selection_lower,
  append: selection_append,
  insert: selection_insert,
  remove: selection_remove,
  clone: selection_clone,
  datum: selection_datum,
  on: selection_on,
  dispatch: selection_dispatch,
  [Symbol.iterator]: selection_iterator
};
function select(selector2) {
  return typeof selector2 === "string" ? new Selection([[document.querySelector(selector2)]], [document.documentElement]) : new Selection([[selector2]], root);
}

// build/src/core/Scheduler.js
var HeliosScheduler = class {
  constructor(helios, {FPS = 60, throttle = true, maxQueueLength = 10}) {
    this.helios = helios;
    this.needsRender = false;
    this.needsUpdateNodesGeometry = false;
    this.needsUpdateEdgesGeometry = false;
    this._FPS = FPS;
    this._throttle = throttle;
    this._started = false;
    this._paused = true;
    this._lastFPS = 0;
    this._averageFPS = 0;
    this._tasks = {};
    this._executionCount = 0, this._lastTimestamp = null, this._currentTimestamp = null, this._lastExecutionTimestamp = null, this._lastRequestFrameID = 0;
    this._timeout = null;
    this._times = [];
    this._lastRepeatInterval = 0;
  }
  FPS(value) {
    if (value === void 0) {
      return this.FPS;
    }
    this.FPS = value;
    return this;
  }
  schedule({
    name = "default",
    callback = null,
    delay = 0,
    repeat = false,
    maxRepeatCount = Infinity,
    maxRepeatTime = Infinity,
    repeatInterval = 0,
    synchronized = true,
    immediateUpdates = false,
    updateNodesGeometry = false,
    updateEdgesGeometry = false,
    redraw = true,
    replace = true
  }) {
    let newTask = {
      callback,
      delay,
      repeat,
      maxRepeatCount,
      maxRepeatTime,
      repeatInterval,
      synchronized,
      immediateUpdates,
      updateNodesGeometry,
      updateEdgesGeometry,
      redraw,
      replace,
      executionCount: 0,
      lastTimestamp: window.performance.now(),
      lastExecutionTime: 0,
      shouldBeRemoved: false,
      cancel: function() {
        this.shouldBeRemoved = true;
        if (!this.synchronized) {
          clearTimeout(this._timeout);
        }
      }
    };
    if (!(name in this._tasks)) {
      this._tasks[name] = [];
    }
    if (replace) {
      this._clearTask(name);
    }
    if (!synchronized) {
      this.runAsyncTask(newTask, newTask.delay);
    }
    this._addTaskToQueue(newTask, name);
    if (this._paused && this._started) {
      this._updateTimeout();
    }
    return this;
  }
  runAsyncTask(newTask, delay = 0) {
    newTask.timeout = setTimeout(() => {
      if (newTask.shouldBeRemoved) {
        return;
      }
      let currentTimestamp = window.performance.now();
      let elapsedTime = currentTimestamp - newTask.lastTimestamp;
      newTask.callback?.(elapsedTime, newTask);
      newTask.executionCount += 1;
      if (newTask.immediateUpdates) {
        this._updateHelios(newTask.needsRender, newTask.needsUpdateNodesGeometry, newTask.needsUpdateEdgesGeometry);
      } else {
        if (newTask.redraw) {
          this.needsRender = true;
        }
        if (newTask.updateNodesGeometry) {
          this.needsUpdateNodesGeometry = true;
        }
        if (newTask.updateEdgesGeometry) {
          this.needsUpdateEdgesGeometry = true;
        }
      }
      if (newTask.repeat) {
        let newCurrentTimestamp = window.performance.now();
        newTask.lastExecutionTime = newCurrentTimestamp - currentTimestamp;
        newTask.lastTimestamp = currentTimestamp;
        let repeatInterval = newTask.repeatInterval - (newCurrentTimestamp - currentTimestamp);
        if (repeatInterval < 0) {
          repeatInterval = 0;
        }
        if (newTask.executionCount >= newTask.maxRepeatCount) {
          newTask.shouldBeRemoved = true;
        } else {
          this.runAsyncTask(newTask, repeatInterval);
        }
      } else {
        newTask.shouldBeRemoved = true;
      }
      if (this._started && this._paused) {
        this._updateTimeout();
      }
    }, delay);
  }
  runSyncTasks() {
    let allTasksCurrentTimestamp = window.performance.now();
    for (let taskName of Object.keys(this._tasks).sort()) {
      let task = this._tasks[taskName];
      for (let i = 0; i < task.length; i++) {
        if (task[i].synchronized || !task[i].immediateUpdates) {
          if (task[i].redraw) {
            this.needsRender = true;
          }
          if (task[i].updateNodesGeometry) {
            this.needsUpdateNodesGeometry = true;
          }
          if (task[i].updateEdgesGeometry) {
            this.needsUpdateEdgesGeometry = true;
          }
        }
        if (!task[i].shouldBeRemoved) {
          let currentTimestamp = window.performance.now();
          let elapsedTime = currentTimestamp - task[i].lastTimestamp + task[i].lastExecutionTime;
          if (elapsedTime < 0) {
            elapsedTime = 0;
          }
          let willExecute = false;
          if (task[i].executionCount == 0) {
            if (elapsedTime >= task[i].delay) {
              willExecute = true;
            }
          } else {
            if (elapsedTime >= task[i].repeatInterval) {
              willExecute = true;
            }
          }
          if (willExecute) {
            task[i].callback?.(elapsedTime, task[i]);
            if (task[i] === void 0) {
              break;
            }
            task[i].executionCount += 1;
            if (task[i].repeat && task[i].executionCount < task[i].maxRepeatCount) {
              let newCurrentTimestamp = window.performance.now();
              task[i].lastExecutionTime = newCurrentTimestamp - currentTimestamp;
              task[i].lastTimestamp = currentTimestamp;
            } else {
              task[i].shouldBeRemoved = true;
            }
          }
        }
        if (task[i].shouldBeRemoved) {
          task.splice(i, 1);
          i--;
        }
      }
      if (task.length == 0) {
        delete this._tasks[taskName];
      }
    }
    this._lastTimestamp = allTasksCurrentTimestamp;
    this._updateHelios(this.needsRender, this.needsUpdateNodesGeometry, this.needsUpdateEdgesGeometry, true);
  }
  _updateHelios(needsRender, needsUpdateNodesGeometry, needsUpdateEdgesGeometry, updateTimeoutAfterRender) {
    if (needsRender === void 0) {
      needsRender = this.needsRender;
    }
    if (needsUpdateNodesGeometry === void 0) {
      needsUpdateNodesGeometry = this.needsUpdateNodesGeometry;
    }
    if (needsUpdateEdgesGeometry === void 0) {
      needsUpdateEdgesGeometry = this.needsUpdateEdgesGeometry;
    }
    if (needsUpdateNodesGeometry) {
      this.helios.updateNodesGeometry();
      this.needsUpdateNodesGeometry = false;
    }
    if (needsUpdateEdgesGeometry) {
      this.helios.updateEdgesGeometry();
      this.needsUpdateEdgesGeometry = false;
    }
    cancelAnimationFrame(this.lastRequestFrameID);
    this.lastRequestFrameID = requestAnimationFrame(() => {
      const now2 = performance.now();
      while (this._times.length > 0 && this._times[0] <= now2 - 1e3) {
        this._times.shift();
      }
      this._times.push(now2);
      this._averageFPS = this._times.length;
      if (needsRender) {
        this.helios.redraw();
        this.needsRender = false;
      }
      if (updateTimeoutAfterRender) {
        this._lastExecutionTimestamp = window.performance.now();
        this._updateTimeout();
      }
    });
  }
  _addTaskToQueue(task, name) {
    let taskQueue = this._tasks[name];
    taskQueue.push(task);
    if (taskQueue.length > this.maxQueueLength) {
      if (taskQueue[0].timeout) {
        taskQueue[0].shouldBeRemoved = true;
        clearTimeout(task.taskQueue[0]);
      }
      taskQueue.shift();
      console.warn(`One task was discarded because of too many tasks in the ${name} queue. (maxQueueLength = ${this.maxQueueLength})`);
    }
  }
  _clearTask(name) {
    if (name in this._tasks) {
      let taskQueue = this._tasks[name];
      for (let taskIndex = 0; taskIndex < taskQueue.length; taskIndex++) {
        let task = taskQueue[taskIndex];
        if (task.timeout) {
          task.shouldBeRemoved = true;
          clearTimeout(task.timeout);
        }
      }
      taskQueue.length = 0;
    }
  }
  unschedule(name) {
    if (name in this._tasks) {
      this._clearTask(name);
      delete this._tasks[name];
    }
    this._updateTimeout();
    return this;
  }
  start() {
    this._started = true;
    this._updateTimeout();
    return this;
  }
  stop() {
    clearTimeout(this._timeout);
    this.paused = false;
    this.started = false;
    this._lastTimestamp = null;
    this._lastExecutionTime = 0;
    return this;
  }
  _updateTimeout() {
    clearTimeout(this._timeout);
    if (this._started) {
      if (Object.keys(this._tasks).length === 0) {
        this.paused = true;
      } else {
        this.paused = false;
        let repeatInterval = 0;
        let currentTimestamp = window.performance.now();
        if (this._lastTimestamp != null && this._throttle) {
          let fpsRepeatInterval = 1e3 / this._FPS;
          repeatInterval = fpsRepeatInterval - (currentTimestamp - this._lastTimestamp);
          if (repeatInterval < 0) {
            repeatInterval = 0;
          }
        }
        this._lastFPS = 1e3 / (currentTimestamp - this._lastTimestamp);
        this._timeout = setTimeout(() => {
          this.runSyncTasks();
        }, repeatInterval);
      }
    }
  }
};

// build/_snowpack/pkg/common/string-cfd0b55d.js
function interpolateNumber(a, b) {
  return a = +a, b = +b, function(t) {
    return a * (1 - t) + b * t;
  };
}
var reA = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g;
var reB = new RegExp(reA.source, "g");
function zero2(b) {
  return function() {
    return b;
  };
}
function one(b) {
  return function(t) {
    return b(t) + "";
  };
}
function interpolateString(a, b) {
  var bi = reA.lastIndex = reB.lastIndex = 0, am, bm, bs, i = -1, s = [], q = [];
  a = a + "", b = b + "";
  while ((am = reA.exec(a)) && (bm = reB.exec(b))) {
    if ((bs = bm.index) > bi) {
      bs = b.slice(bi, bs);
      if (s[i])
        s[i] += bs;
      else
        s[++i] = bs;
    }
    if ((am = am[0]) === (bm = bm[0])) {
      if (s[i])
        s[i] += bm;
      else
        s[++i] = bm;
    } else {
      s[++i] = null;
      q.push({i, x: interpolateNumber(am, bm)});
    }
    bi = reB.lastIndex;
  }
  if (bi < b.length) {
    bs = b.slice(bi);
    if (s[i])
      s[i] += bs;
    else
      s[++i] = bs;
  }
  return s.length < 2 ? q[0] ? one(q[0].x) : zero2(b) : (b = q.length, function(t) {
    for (var i2 = 0, o; i2 < b; ++i2)
      s[(o = q[i2]).i] = o.x(t);
    return s.join("");
  });
}

// build/_snowpack/pkg/common/color-a4ab9cc4.js
function define2(constructor, factory, prototype) {
  constructor.prototype = factory.prototype = prototype;
  prototype.constructor = constructor;
}
function extend(parent, definition) {
  var prototype = Object.create(parent.prototype);
  for (var key in definition)
    prototype[key] = definition[key];
  return prototype;
}
function Color() {
}
var darker = 0.7;
var brighter = 1 / darker;
var reI = "\\s*([+-]?\\d+)\\s*";
var reN = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)\\s*";
var reP = "\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)%\\s*";
var reHex = /^#([0-9a-f]{3,8})$/;
var reRgbInteger = new RegExp("^rgb\\(" + [reI, reI, reI] + "\\)$");
var reRgbPercent = new RegExp("^rgb\\(" + [reP, reP, reP] + "\\)$");
var reRgbaInteger = new RegExp("^rgba\\(" + [reI, reI, reI, reN] + "\\)$");
var reRgbaPercent = new RegExp("^rgba\\(" + [reP, reP, reP, reN] + "\\)$");
var reHslPercent = new RegExp("^hsl\\(" + [reN, reP, reP] + "\\)$");
var reHslaPercent = new RegExp("^hsla\\(" + [reN, reP, reP, reN] + "\\)$");
var named = {
  aliceblue: 15792383,
  antiquewhite: 16444375,
  aqua: 65535,
  aquamarine: 8388564,
  azure: 15794175,
  beige: 16119260,
  bisque: 16770244,
  black: 0,
  blanchedalmond: 16772045,
  blue: 255,
  blueviolet: 9055202,
  brown: 10824234,
  burlywood: 14596231,
  cadetblue: 6266528,
  chartreuse: 8388352,
  chocolate: 13789470,
  coral: 16744272,
  cornflowerblue: 6591981,
  cornsilk: 16775388,
  crimson: 14423100,
  cyan: 65535,
  darkblue: 139,
  darkcyan: 35723,
  darkgoldenrod: 12092939,
  darkgray: 11119017,
  darkgreen: 25600,
  darkgrey: 11119017,
  darkkhaki: 12433259,
  darkmagenta: 9109643,
  darkolivegreen: 5597999,
  darkorange: 16747520,
  darkorchid: 10040012,
  darkred: 9109504,
  darksalmon: 15308410,
  darkseagreen: 9419919,
  darkslateblue: 4734347,
  darkslategray: 3100495,
  darkslategrey: 3100495,
  darkturquoise: 52945,
  darkviolet: 9699539,
  deeppink: 16716947,
  deepskyblue: 49151,
  dimgray: 6908265,
  dimgrey: 6908265,
  dodgerblue: 2003199,
  firebrick: 11674146,
  floralwhite: 16775920,
  forestgreen: 2263842,
  fuchsia: 16711935,
  gainsboro: 14474460,
  ghostwhite: 16316671,
  gold: 16766720,
  goldenrod: 14329120,
  gray: 8421504,
  green: 32768,
  greenyellow: 11403055,
  grey: 8421504,
  honeydew: 15794160,
  hotpink: 16738740,
  indianred: 13458524,
  indigo: 4915330,
  ivory: 16777200,
  khaki: 15787660,
  lavender: 15132410,
  lavenderblush: 16773365,
  lawngreen: 8190976,
  lemonchiffon: 16775885,
  lightblue: 11393254,
  lightcoral: 15761536,
  lightcyan: 14745599,
  lightgoldenrodyellow: 16448210,
  lightgray: 13882323,
  lightgreen: 9498256,
  lightgrey: 13882323,
  lightpink: 16758465,
  lightsalmon: 16752762,
  lightseagreen: 2142890,
  lightskyblue: 8900346,
  lightslategray: 7833753,
  lightslategrey: 7833753,
  lightsteelblue: 11584734,
  lightyellow: 16777184,
  lime: 65280,
  limegreen: 3329330,
  linen: 16445670,
  magenta: 16711935,
  maroon: 8388608,
  mediumaquamarine: 6737322,
  mediumblue: 205,
  mediumorchid: 12211667,
  mediumpurple: 9662683,
  mediumseagreen: 3978097,
  mediumslateblue: 8087790,
  mediumspringgreen: 64154,
  mediumturquoise: 4772300,
  mediumvioletred: 13047173,
  midnightblue: 1644912,
  mintcream: 16121850,
  mistyrose: 16770273,
  moccasin: 16770229,
  navajowhite: 16768685,
  navy: 128,
  oldlace: 16643558,
  olive: 8421376,
  olivedrab: 7048739,
  orange: 16753920,
  orangered: 16729344,
  orchid: 14315734,
  palegoldenrod: 15657130,
  palegreen: 10025880,
  paleturquoise: 11529966,
  palevioletred: 14381203,
  papayawhip: 16773077,
  peachpuff: 16767673,
  peru: 13468991,
  pink: 16761035,
  plum: 14524637,
  powderblue: 11591910,
  purple: 8388736,
  rebeccapurple: 6697881,
  red: 16711680,
  rosybrown: 12357519,
  royalblue: 4286945,
  saddlebrown: 9127187,
  salmon: 16416882,
  sandybrown: 16032864,
  seagreen: 3050327,
  seashell: 16774638,
  sienna: 10506797,
  silver: 12632256,
  skyblue: 8900331,
  slateblue: 6970061,
  slategray: 7372944,
  slategrey: 7372944,
  snow: 16775930,
  springgreen: 65407,
  steelblue: 4620980,
  tan: 13808780,
  teal: 32896,
  thistle: 14204888,
  tomato: 16737095,
  turquoise: 4251856,
  violet: 15631086,
  wheat: 16113331,
  white: 16777215,
  whitesmoke: 16119285,
  yellow: 16776960,
  yellowgreen: 10145074
};
define2(Color, color, {
  copy: function(channels) {
    return Object.assign(new this.constructor(), this, channels);
  },
  displayable: function() {
    return this.rgb().displayable();
  },
  hex: color_formatHex,
  formatHex: color_formatHex,
  formatHsl: color_formatHsl,
  formatRgb: color_formatRgb,
  toString: color_formatRgb
});
function color_formatHex() {
  return this.rgb().formatHex();
}
function color_formatHsl() {
  return hslConvert(this).formatHsl();
}
function color_formatRgb() {
  return this.rgb().formatRgb();
}
function color(format) {
  var m, l;
  format = (format + "").trim().toLowerCase();
  return (m = reHex.exec(format)) ? (l = m[1].length, m = parseInt(m[1], 16), l === 6 ? rgbn(m) : l === 3 ? new Rgb(m >> 8 & 15 | m >> 4 & 240, m >> 4 & 15 | m & 240, (m & 15) << 4 | m & 15, 1) : l === 8 ? rgba(m >> 24 & 255, m >> 16 & 255, m >> 8 & 255, (m & 255) / 255) : l === 4 ? rgba(m >> 12 & 15 | m >> 8 & 240, m >> 8 & 15 | m >> 4 & 240, m >> 4 & 15 | m & 240, ((m & 15) << 4 | m & 15) / 255) : null) : (m = reRgbInteger.exec(format)) ? new Rgb(m[1], m[2], m[3], 1) : (m = reRgbPercent.exec(format)) ? new Rgb(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, 1) : (m = reRgbaInteger.exec(format)) ? rgba(m[1], m[2], m[3], m[4]) : (m = reRgbaPercent.exec(format)) ? rgba(m[1] * 255 / 100, m[2] * 255 / 100, m[3] * 255 / 100, m[4]) : (m = reHslPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, 1) : (m = reHslaPercent.exec(format)) ? hsla(m[1], m[2] / 100, m[3] / 100, m[4]) : named.hasOwnProperty(format) ? rgbn(named[format]) : format === "transparent" ? new Rgb(NaN, NaN, NaN, 0) : null;
}
function rgbn(n) {
  return new Rgb(n >> 16 & 255, n >> 8 & 255, n & 255, 1);
}
function rgba(r, g, b, a) {
  if (a <= 0)
    r = g = b = NaN;
  return new Rgb(r, g, b, a);
}
function rgbConvert(o) {
  if (!(o instanceof Color))
    o = color(o);
  if (!o)
    return new Rgb();
  o = o.rgb();
  return new Rgb(o.r, o.g, o.b, o.opacity);
}
function rgb(r, g, b, opacity) {
  return arguments.length === 1 ? rgbConvert(r) : new Rgb(r, g, b, opacity == null ? 1 : opacity);
}
function Rgb(r, g, b, opacity) {
  this.r = +r;
  this.g = +g;
  this.b = +b;
  this.opacity = +opacity;
}
define2(Rgb, rgb, extend(Color, {
  brighter: function(k) {
    k = k == null ? brighter : Math.pow(brighter, k);
    return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
  },
  darker: function(k) {
    k = k == null ? darker : Math.pow(darker, k);
    return new Rgb(this.r * k, this.g * k, this.b * k, this.opacity);
  },
  rgb: function() {
    return this;
  },
  displayable: function() {
    return -0.5 <= this.r && this.r < 255.5 && (-0.5 <= this.g && this.g < 255.5) && (-0.5 <= this.b && this.b < 255.5) && (0 <= this.opacity && this.opacity <= 1);
  },
  hex: rgb_formatHex,
  formatHex: rgb_formatHex,
  formatRgb: rgb_formatRgb,
  toString: rgb_formatRgb
}));
function rgb_formatHex() {
  return "#" + hex(this.r) + hex(this.g) + hex(this.b);
}
function rgb_formatRgb() {
  var a = this.opacity;
  a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
  return (a === 1 ? "rgb(" : "rgba(") + Math.max(0, Math.min(255, Math.round(this.r) || 0)) + ", " + Math.max(0, Math.min(255, Math.round(this.g) || 0)) + ", " + Math.max(0, Math.min(255, Math.round(this.b) || 0)) + (a === 1 ? ")" : ", " + a + ")");
}
function hex(value) {
  value = Math.max(0, Math.min(255, Math.round(value) || 0));
  return (value < 16 ? "0" : "") + value.toString(16);
}
function hsla(h, s, l, a) {
  if (a <= 0)
    h = s = l = NaN;
  else if (l <= 0 || l >= 1)
    h = s = NaN;
  else if (s <= 0)
    h = NaN;
  return new Hsl(h, s, l, a);
}
function hslConvert(o) {
  if (o instanceof Hsl)
    return new Hsl(o.h, o.s, o.l, o.opacity);
  if (!(o instanceof Color))
    o = color(o);
  if (!o)
    return new Hsl();
  if (o instanceof Hsl)
    return o;
  o = o.rgb();
  var r = o.r / 255, g = o.g / 255, b = o.b / 255, min2 = Math.min(r, g, b), max2 = Math.max(r, g, b), h = NaN, s = max2 - min2, l = (max2 + min2) / 2;
  if (s) {
    if (r === max2)
      h = (g - b) / s + (g < b) * 6;
    else if (g === max2)
      h = (b - r) / s + 2;
    else
      h = (r - g) / s + 4;
    s /= l < 0.5 ? max2 + min2 : 2 - max2 - min2;
    h *= 60;
  } else {
    s = l > 0 && l < 1 ? 0 : h;
  }
  return new Hsl(h, s, l, o.opacity);
}
function hsl(h, s, l, opacity) {
  return arguments.length === 1 ? hslConvert(h) : new Hsl(h, s, l, opacity == null ? 1 : opacity);
}
function Hsl(h, s, l, opacity) {
  this.h = +h;
  this.s = +s;
  this.l = +l;
  this.opacity = +opacity;
}
define2(Hsl, hsl, extend(Color, {
  brighter: function(k) {
    k = k == null ? brighter : Math.pow(brighter, k);
    return new Hsl(this.h, this.s, this.l * k, this.opacity);
  },
  darker: function(k) {
    k = k == null ? darker : Math.pow(darker, k);
    return new Hsl(this.h, this.s, this.l * k, this.opacity);
  },
  rgb: function() {
    var h = this.h % 360 + (this.h < 0) * 360, s = isNaN(h) || isNaN(this.s) ? 0 : this.s, l = this.l, m2 = l + (l < 0.5 ? l : 1 - l) * s, m1 = 2 * l - m2;
    return new Rgb(hsl2rgb(h >= 240 ? h - 240 : h + 120, m1, m2), hsl2rgb(h, m1, m2), hsl2rgb(h < 120 ? h + 240 : h - 120, m1, m2), this.opacity);
  },
  displayable: function() {
    return (0 <= this.s && this.s <= 1 || isNaN(this.s)) && (0 <= this.l && this.l <= 1) && (0 <= this.opacity && this.opacity <= 1);
  },
  formatHsl: function() {
    var a = this.opacity;
    a = isNaN(a) ? 1 : Math.max(0, Math.min(1, a));
    return (a === 1 ? "hsl(" : "hsla(") + (this.h || 0) + ", " + (this.s || 0) * 100 + "%, " + (this.l || 0) * 100 + "%" + (a === 1 ? ")" : ", " + a + ")");
  }
}));
function hsl2rgb(h, m1, m2) {
  return (h < 60 ? m1 + (m2 - m1) * h / 60 : h < 180 ? m2 : h < 240 ? m1 + (m2 - m1) * (240 - h) / 60 : m1) * 255;
}

// build/_snowpack/pkg/common/rgb-90dc4bb7.js
function basis(t1, v0, v1, v2, v3) {
  var t2 = t1 * t1, t3 = t2 * t1;
  return ((1 - 3 * t1 + 3 * t2 - t3) * v0 + (4 - 6 * t2 + 3 * t3) * v1 + (1 + 3 * t1 + 3 * t2 - 3 * t3) * v2 + t3 * v3) / 6;
}
function basis$1(values) {
  var n = values.length - 1;
  return function(t) {
    var i = t <= 0 ? t = 0 : t >= 1 ? (t = 1, n - 1) : Math.floor(t * n), v1 = values[i], v2 = values[i + 1], v0 = i > 0 ? values[i - 1] : 2 * v1 - v2, v3 = i < n - 1 ? values[i + 2] : 2 * v2 - v1;
    return basis((t - i / n) * n, v0, v1, v2, v3);
  };
}
var constant2 = (x) => () => x;
function linear(a, d) {
  return function(t) {
    return a + t * d;
  };
}
function exponential(a, b, y) {
  return a = Math.pow(a, y), b = Math.pow(b, y) - a, y = 1 / y, function(t) {
    return Math.pow(a + t * b, y);
  };
}
function gamma(y) {
  return (y = +y) === 1 ? nogamma : function(a, b) {
    return b - a ? exponential(a, b, y) : constant2(isNaN(a) ? b : a);
  };
}
function nogamma(a, b) {
  var d = b - a;
  return d ? linear(a, d) : constant2(isNaN(a) ? b : a);
}
var interpolateRgb = function rgbGamma(y) {
  var color2 = gamma(y);
  function rgb$1(start2, end) {
    var r = color2((start2 = rgb(start2)).r, (end = rgb(end)).r), g = color2(start2.g, end.g), b = color2(start2.b, end.b), opacity = nogamma(start2.opacity, end.opacity);
    return function(t) {
      start2.r = r(t);
      start2.g = g(t);
      start2.b = b(t);
      start2.opacity = opacity(t);
      return start2 + "";
    };
  }
  rgb$1.gamma = rgbGamma;
  return rgb$1;
}(1);
function rgbSpline(spline) {
  return function(colors2) {
    var n = colors2.length, r = new Array(n), g = new Array(n), b = new Array(n), i, color2;
    for (i = 0; i < n; ++i) {
      color2 = rgb(colors2[i]);
      r[i] = color2.r || 0;
      g[i] = color2.g || 0;
      b[i] = color2.b || 0;
    }
    r = spline(r);
    g = spline(g);
    b = spline(b);
    color2.opacity = 1;
    return function(t) {
      color2.r = r(t);
      color2.g = g(t);
      color2.b = b(t);
      return color2 + "";
    };
  };
}
var rgbBasis = rgbSpline(basis$1);

// build/_snowpack/pkg/d3-zoom.js
var degrees = 180 / Math.PI;
var identity = {
  translateX: 0,
  translateY: 0,
  rotate: 0,
  skewX: 0,
  scaleX: 1,
  scaleY: 1
};
function decompose(a, b, c, d, e, f) {
  var scaleX, scaleY, skewX;
  if (scaleX = Math.sqrt(a * a + b * b))
    a /= scaleX, b /= scaleX;
  if (skewX = a * c + b * d)
    c -= a * skewX, d -= b * skewX;
  if (scaleY = Math.sqrt(c * c + d * d))
    c /= scaleY, d /= scaleY, skewX /= scaleY;
  if (a * d < b * c)
    a = -a, b = -b, skewX = -skewX, scaleX = -scaleX;
  return {
    translateX: e,
    translateY: f,
    rotate: Math.atan2(b, a) * degrees,
    skewX: Math.atan(skewX) * degrees,
    scaleX,
    scaleY
  };
}
var svgNode;
function parseCss(value) {
  const m = new (typeof DOMMatrix === "function" ? DOMMatrix : WebKitCSSMatrix)(value + "");
  return m.isIdentity ? identity : decompose(m.a, m.b, m.c, m.d, m.e, m.f);
}
function parseSvg(value) {
  if (value == null)
    return identity;
  if (!svgNode)
    svgNode = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svgNode.setAttribute("transform", value);
  if (!(value = svgNode.transform.baseVal.consolidate()))
    return identity;
  value = value.matrix;
  return decompose(value.a, value.b, value.c, value.d, value.e, value.f);
}
function interpolateTransform(parse, pxComma, pxParen, degParen) {
  function pop(s) {
    return s.length ? s.pop() + " " : "";
  }
  function translate(xa, ya, xb, yb, s, q) {
    if (xa !== xb || ya !== yb) {
      var i = s.push("translate(", null, pxComma, null, pxParen);
      q.push({i: i - 4, x: interpolateNumber(xa, xb)}, {i: i - 2, x: interpolateNumber(ya, yb)});
    } else if (xb || yb) {
      s.push("translate(" + xb + pxComma + yb + pxParen);
    }
  }
  function rotate(a, b, s, q) {
    if (a !== b) {
      if (a - b > 180)
        b += 360;
      else if (b - a > 180)
        a += 360;
      q.push({i: s.push(pop(s) + "rotate(", null, degParen) - 2, x: interpolateNumber(a, b)});
    } else if (b) {
      s.push(pop(s) + "rotate(" + b + degParen);
    }
  }
  function skewX(a, b, s, q) {
    if (a !== b) {
      q.push({i: s.push(pop(s) + "skewX(", null, degParen) - 2, x: interpolateNumber(a, b)});
    } else if (b) {
      s.push(pop(s) + "skewX(" + b + degParen);
    }
  }
  function scale(xa, ya, xb, yb, s, q) {
    if (xa !== xb || ya !== yb) {
      var i = s.push(pop(s) + "scale(", null, ",", null, ")");
      q.push({i: i - 4, x: interpolateNumber(xa, xb)}, {i: i - 2, x: interpolateNumber(ya, yb)});
    } else if (xb !== 1 || yb !== 1) {
      s.push(pop(s) + "scale(" + xb + "," + yb + ")");
    }
  }
  return function(a, b) {
    var s = [], q = [];
    a = parse(a), b = parse(b);
    translate(a.translateX, a.translateY, b.translateX, b.translateY, s, q);
    rotate(a.rotate, b.rotate, s, q);
    skewX(a.skewX, b.skewX, s, q);
    scale(a.scaleX, a.scaleY, b.scaleX, b.scaleY, s, q);
    a = b = null;
    return function(t) {
      var i = -1, n = q.length, o;
      while (++i < n)
        s[(o = q[i]).i] = o.x(t);
      return s.join("");
    };
  };
}
var interpolateTransformCss = interpolateTransform(parseCss, "px, ", "px)", "deg)");
var interpolateTransformSvg = interpolateTransform(parseSvg, ", ", ")", ")");
var epsilon2 = 1e-12;
function cosh(x) {
  return ((x = Math.exp(x)) + 1 / x) / 2;
}
function sinh(x) {
  return ((x = Math.exp(x)) - 1 / x) / 2;
}
function tanh(x) {
  return ((x = Math.exp(2 * x)) - 1) / (x + 1);
}
var interpolateZoom = function zoomRho(rho, rho2, rho4) {
  function zoom2(p0, p1) {
    var ux0 = p0[0], uy0 = p0[1], w0 = p0[2], ux1 = p1[0], uy1 = p1[1], w1 = p1[2], dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy, i, S;
    if (d2 < epsilon2) {
      S = Math.log(w1 / w0) / rho;
      i = function(t) {
        return [
          ux0 + t * dx,
          uy0 + t * dy,
          w0 * Math.exp(rho * t * S)
        ];
      };
    } else {
      var d1 = Math.sqrt(d2), b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1), b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1), r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
      S = (r1 - r0) / rho;
      i = function(t) {
        var s = t * S, coshr0 = cosh(r0), u = w0 / (rho2 * d1) * (coshr0 * tanh(rho * s + r0) - sinh(r0));
        return [
          ux0 + u * dx,
          uy0 + u * dy,
          w0 * coshr0 / cosh(rho * s + r0)
        ];
      };
    }
    i.duration = S * 1e3 * rho / Math.SQRT2;
    return i;
  }
  zoom2.rho = function(_) {
    var _1 = Math.max(1e-3, +_), _2 = _1 * _1, _4 = _2 * _2;
    return zoomRho(_1, _2, _4);
  };
  return zoom2;
}(Math.SQRT2, 2, 4);
function sourceEvent(event) {
  let sourceEvent2;
  while (sourceEvent2 = event.sourceEvent)
    event = sourceEvent2;
  return event;
}
function pointer(event, node) {
  event = sourceEvent(event);
  if (node === void 0)
    node = event.currentTarget;
  if (node) {
    var svg = node.ownerSVGElement || node;
    if (svg.createSVGPoint) {
      var point = svg.createSVGPoint();
      point.x = event.clientX, point.y = event.clientY;
      point = point.matrixTransform(node.getScreenCTM().inverse());
      return [point.x, point.y];
    }
    if (node.getBoundingClientRect) {
      var rect = node.getBoundingClientRect();
      return [event.clientX - rect.left - node.clientLeft, event.clientY - rect.top - node.clientTop];
    }
  }
  return [event.pageX, event.pageY];
}
var noop = {value: () => {
}};
function dispatch() {
  for (var i = 0, n = arguments.length, _ = {}, t; i < n; ++i) {
    if (!(t = arguments[i] + "") || t in _ || /[\s.]/.test(t))
      throw new Error("illegal type: " + t);
    _[t] = [];
  }
  return new Dispatch(_);
}
function Dispatch(_) {
  this._ = _;
}
function parseTypenames2(typenames, types) {
  return typenames.trim().split(/^|\s+/).map(function(t) {
    var name = "", i = t.indexOf(".");
    if (i >= 0)
      name = t.slice(i + 1), t = t.slice(0, i);
    if (t && !types.hasOwnProperty(t))
      throw new Error("unknown type: " + t);
    return {type: t, name};
  });
}
Dispatch.prototype = dispatch.prototype = {
  constructor: Dispatch,
  on: function(typename, callback) {
    var _ = this._, T = parseTypenames2(typename + "", _), t, i = -1, n = T.length;
    if (arguments.length < 2) {
      while (++i < n)
        if ((t = (typename = T[i]).type) && (t = get(_[t], typename.name)))
          return t;
      return;
    }
    if (callback != null && typeof callback !== "function")
      throw new Error("invalid callback: " + callback);
    while (++i < n) {
      if (t = (typename = T[i]).type)
        _[t] = set(_[t], typename.name, callback);
      else if (callback == null)
        for (t in _)
          _[t] = set(_[t], typename.name, null);
    }
    return this;
  },
  copy: function() {
    var copy = {}, _ = this._;
    for (var t in _)
      copy[t] = _[t].slice();
    return new Dispatch(copy);
  },
  call: function(type, that) {
    if ((n = arguments.length - 2) > 0)
      for (var args = new Array(n), i = 0, n, t; i < n; ++i)
        args[i] = arguments[i + 2];
    if (!this._.hasOwnProperty(type))
      throw new Error("unknown type: " + type);
    for (t = this._[type], i = 0, n = t.length; i < n; ++i)
      t[i].value.apply(that, args);
  },
  apply: function(type, that, args) {
    if (!this._.hasOwnProperty(type))
      throw new Error("unknown type: " + type);
    for (var t = this._[type], i = 0, n = t.length; i < n; ++i)
      t[i].value.apply(that, args);
  }
};
function get(type, name) {
  for (var i = 0, n = type.length, c; i < n; ++i) {
    if ((c = type[i]).name === name) {
      return c.value;
    }
  }
}
function set(type, name, callback) {
  for (var i = 0, n = type.length; i < n; ++i) {
    if (type[i].name === name) {
      type[i] = noop, type = type.slice(0, i).concat(type.slice(i + 1));
      break;
    }
  }
  if (callback != null)
    type.push({name, value: callback});
  return type;
}
var nonpassivecapture = {capture: true, passive: false};
function noevent(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}
function dragDisable(view) {
  var root2 = view.document.documentElement, selection2 = select(view).on("dragstart.drag", noevent, nonpassivecapture);
  if ("onselectstart" in root2) {
    selection2.on("selectstart.drag", noevent, nonpassivecapture);
  } else {
    root2.__noselect = root2.style.MozUserSelect;
    root2.style.MozUserSelect = "none";
  }
}
function yesdrag(view, noclick) {
  var root2 = view.document.documentElement, selection2 = select(view).on("dragstart.drag", null);
  if (noclick) {
    selection2.on("click.drag", noevent, nonpassivecapture);
    setTimeout(function() {
      selection2.on("click.drag", null);
    }, 0);
  }
  if ("onselectstart" in root2) {
    selection2.on("selectstart.drag", null);
  } else {
    root2.style.MozUserSelect = root2.__noselect;
    delete root2.__noselect;
  }
}
var frame = 0;
var timeout = 0;
var interval = 0;
var pokeDelay = 1e3;
var taskHead;
var taskTail;
var clockLast = 0;
var clockNow = 0;
var clockSkew = 0;
var clock = typeof performance === "object" && performance.now ? performance : Date;
var setFrame = typeof window === "object" && window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function(f) {
  setTimeout(f, 17);
};
function now() {
  return clockNow || (setFrame(clearNow), clockNow = clock.now() + clockSkew);
}
function clearNow() {
  clockNow = 0;
}
function Timer() {
  this._call = this._time = this._next = null;
}
Timer.prototype = timer.prototype = {
  constructor: Timer,
  restart: function(callback, delay, time) {
    if (typeof callback !== "function")
      throw new TypeError("callback is not a function");
    time = (time == null ? now() : +time) + (delay == null ? 0 : +delay);
    if (!this._next && taskTail !== this) {
      if (taskTail)
        taskTail._next = this;
      else
        taskHead = this;
      taskTail = this;
    }
    this._call = callback;
    this._time = time;
    sleep();
  },
  stop: function() {
    if (this._call) {
      this._call = null;
      this._time = Infinity;
      sleep();
    }
  }
};
function timer(callback, delay, time) {
  var t = new Timer();
  t.restart(callback, delay, time);
  return t;
}
function timerFlush() {
  now();
  ++frame;
  var t = taskHead, e;
  while (t) {
    if ((e = clockNow - t._time) >= 0)
      t._call.call(void 0, e);
    t = t._next;
  }
  --frame;
}
function wake() {
  clockNow = (clockLast = clock.now()) + clockSkew;
  frame = timeout = 0;
  try {
    timerFlush();
  } finally {
    frame = 0;
    nap();
    clockNow = 0;
  }
}
function poke() {
  var now2 = clock.now(), delay = now2 - clockLast;
  if (delay > pokeDelay)
    clockSkew -= delay, clockLast = now2;
}
function nap() {
  var t0, t1 = taskHead, t2, time = Infinity;
  while (t1) {
    if (t1._call) {
      if (time > t1._time)
        time = t1._time;
      t0 = t1, t1 = t1._next;
    } else {
      t2 = t1._next, t1._next = null;
      t1 = t0 ? t0._next = t2 : taskHead = t2;
    }
  }
  taskTail = t0;
  sleep(time);
}
function sleep(time) {
  if (frame)
    return;
  if (timeout)
    timeout = clearTimeout(timeout);
  var delay = time - clockNow;
  if (delay > 24) {
    if (time < Infinity)
      timeout = setTimeout(wake, time - clock.now() - clockSkew);
    if (interval)
      interval = clearInterval(interval);
  } else {
    if (!interval)
      clockLast = clock.now(), interval = setInterval(poke, pokeDelay);
    frame = 1, setFrame(wake);
  }
}
function timeout$1(callback, delay, time) {
  var t = new Timer();
  delay = delay == null ? 0 : +delay;
  t.restart((elapsed) => {
    t.stop();
    callback(elapsed + delay);
  }, delay, time);
  return t;
}
var emptyOn = dispatch("start", "end", "cancel", "interrupt");
var emptyTween = [];
var CREATED = 0;
var SCHEDULED = 1;
var STARTING = 2;
var STARTED = 3;
var RUNNING = 4;
var ENDING = 5;
var ENDED = 6;
function schedule(node, name, id2, index, group, timing) {
  var schedules = node.__transition;
  if (!schedules)
    node.__transition = {};
  else if (id2 in schedules)
    return;
  create(node, id2, {
    name,
    index,
    group,
    on: emptyOn,
    tween: emptyTween,
    time: timing.time,
    delay: timing.delay,
    duration: timing.duration,
    ease: timing.ease,
    timer: null,
    state: CREATED
  });
}
function init(node, id2) {
  var schedule2 = get$1(node, id2);
  if (schedule2.state > CREATED)
    throw new Error("too late; already scheduled");
  return schedule2;
}
function set$1(node, id2) {
  var schedule2 = get$1(node, id2);
  if (schedule2.state > STARTED)
    throw new Error("too late; already running");
  return schedule2;
}
function get$1(node, id2) {
  var schedule2 = node.__transition;
  if (!schedule2 || !(schedule2 = schedule2[id2]))
    throw new Error("transition not found");
  return schedule2;
}
function create(node, id2, self2) {
  var schedules = node.__transition, tween;
  schedules[id2] = self2;
  self2.timer = timer(schedule2, 0, self2.time);
  function schedule2(elapsed) {
    self2.state = SCHEDULED;
    self2.timer.restart(start2, self2.delay, self2.time);
    if (self2.delay <= elapsed)
      start2(elapsed - self2.delay);
  }
  function start2(elapsed) {
    var i, j, n, o;
    if (self2.state !== SCHEDULED)
      return stop();
    for (i in schedules) {
      o = schedules[i];
      if (o.name !== self2.name)
        continue;
      if (o.state === STARTED)
        return timeout$1(start2);
      if (o.state === RUNNING) {
        o.state = ENDED;
        o.timer.stop();
        o.on.call("interrupt", node, node.__data__, o.index, o.group);
        delete schedules[i];
      } else if (+i < id2) {
        o.state = ENDED;
        o.timer.stop();
        o.on.call("cancel", node, node.__data__, o.index, o.group);
        delete schedules[i];
      }
    }
    timeout$1(function() {
      if (self2.state === STARTED) {
        self2.state = RUNNING;
        self2.timer.restart(tick, self2.delay, self2.time);
        tick(elapsed);
      }
    });
    self2.state = STARTING;
    self2.on.call("start", node, node.__data__, self2.index, self2.group);
    if (self2.state !== STARTING)
      return;
    self2.state = STARTED;
    tween = new Array(n = self2.tween.length);
    for (i = 0, j = -1; i < n; ++i) {
      if (o = self2.tween[i].value.call(node, node.__data__, self2.index, self2.group)) {
        tween[++j] = o;
      }
    }
    tween.length = j + 1;
  }
  function tick(elapsed) {
    var t = elapsed < self2.duration ? self2.ease.call(null, elapsed / self2.duration) : (self2.timer.restart(stop), self2.state = ENDING, 1), i = -1, n = tween.length;
    while (++i < n) {
      tween[i].call(node, t);
    }
    if (self2.state === ENDING) {
      self2.on.call("end", node, node.__data__, self2.index, self2.group);
      stop();
    }
  }
  function stop() {
    self2.state = ENDED;
    self2.timer.stop();
    delete schedules[id2];
    for (var i in schedules)
      return;
    delete node.__transition;
  }
}
function interrupt(node, name) {
  var schedules = node.__transition, schedule2, active, empty2 = true, i;
  if (!schedules)
    return;
  name = name == null ? null : name + "";
  for (i in schedules) {
    if ((schedule2 = schedules[i]).name !== name) {
      empty2 = false;
      continue;
    }
    active = schedule2.state > STARTING && schedule2.state < ENDING;
    schedule2.state = ENDED;
    schedule2.timer.stop();
    schedule2.on.call(active ? "interrupt" : "cancel", node, node.__data__, schedule2.index, schedule2.group);
    delete schedules[i];
  }
  if (empty2)
    delete node.__transition;
}
function selection_interrupt(name) {
  return this.each(function() {
    interrupt(this, name);
  });
}
function tweenRemove(id2, name) {
  var tween0, tween1;
  return function() {
    var schedule2 = set$1(this, id2), tween = schedule2.tween;
    if (tween !== tween0) {
      tween1 = tween0 = tween;
      for (var i = 0, n = tween1.length; i < n; ++i) {
        if (tween1[i].name === name) {
          tween1 = tween1.slice();
          tween1.splice(i, 1);
          break;
        }
      }
    }
    schedule2.tween = tween1;
  };
}
function tweenFunction(id2, name, value) {
  var tween0, tween1;
  if (typeof value !== "function")
    throw new Error();
  return function() {
    var schedule2 = set$1(this, id2), tween = schedule2.tween;
    if (tween !== tween0) {
      tween1 = (tween0 = tween).slice();
      for (var t = {name, value}, i = 0, n = tween1.length; i < n; ++i) {
        if (tween1[i].name === name) {
          tween1[i] = t;
          break;
        }
      }
      if (i === n)
        tween1.push(t);
    }
    schedule2.tween = tween1;
  };
}
function transition_tween(name, value) {
  var id2 = this._id;
  name += "";
  if (arguments.length < 2) {
    var tween = get$1(this.node(), id2).tween;
    for (var i = 0, n = tween.length, t; i < n; ++i) {
      if ((t = tween[i]).name === name) {
        return t.value;
      }
    }
    return null;
  }
  return this.each((value == null ? tweenRemove : tweenFunction)(id2, name, value));
}
function tweenValue(transition, name, value) {
  var id2 = transition._id;
  transition.each(function() {
    var schedule2 = set$1(this, id2);
    (schedule2.value || (schedule2.value = {}))[name] = value.apply(this, arguments);
  });
  return function(node) {
    return get$1(node, id2).value[name];
  };
}
function interpolate(a, b) {
  var c;
  return (typeof b === "number" ? interpolateNumber : b instanceof color ? interpolateRgb : (c = color(b)) ? (b = c, interpolateRgb) : interpolateString)(a, b);
}
function attrRemove2(name) {
  return function() {
    this.removeAttribute(name);
  };
}
function attrRemoveNS2(fullname) {
  return function() {
    this.removeAttributeNS(fullname.space, fullname.local);
  };
}
function attrConstant2(name, interpolate2, value1) {
  var string00, string1 = value1 + "", interpolate0;
  return function() {
    var string0 = this.getAttribute(name);
    return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate2(string00 = string0, value1);
  };
}
function attrConstantNS2(fullname, interpolate2, value1) {
  var string00, string1 = value1 + "", interpolate0;
  return function() {
    var string0 = this.getAttributeNS(fullname.space, fullname.local);
    return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate2(string00 = string0, value1);
  };
}
function attrFunction2(name, interpolate2, value) {
  var string00, string10, interpolate0;
  return function() {
    var string0, value1 = value(this), string1;
    if (value1 == null)
      return void this.removeAttribute(name);
    string0 = this.getAttribute(name);
    string1 = value1 + "";
    return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate2(string00 = string0, value1));
  };
}
function attrFunctionNS2(fullname, interpolate2, value) {
  var string00, string10, interpolate0;
  return function() {
    var string0, value1 = value(this), string1;
    if (value1 == null)
      return void this.removeAttributeNS(fullname.space, fullname.local);
    string0 = this.getAttributeNS(fullname.space, fullname.local);
    string1 = value1 + "";
    return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate2(string00 = string0, value1));
  };
}
function transition_attr(name, value) {
  var fullname = namespace(name), i = fullname === "transform" ? interpolateTransformSvg : interpolate;
  return this.attrTween(name, typeof value === "function" ? (fullname.local ? attrFunctionNS2 : attrFunction2)(fullname, i, tweenValue(this, "attr." + name, value)) : value == null ? (fullname.local ? attrRemoveNS2 : attrRemove2)(fullname) : (fullname.local ? attrConstantNS2 : attrConstant2)(fullname, i, value));
}
function attrInterpolate(name, i) {
  return function(t) {
    this.setAttribute(name, i.call(this, t));
  };
}
function attrInterpolateNS(fullname, i) {
  return function(t) {
    this.setAttributeNS(fullname.space, fullname.local, i.call(this, t));
  };
}
function attrTweenNS(fullname, value) {
  var t0, i0;
  function tween() {
    var i = value.apply(this, arguments);
    if (i !== i0)
      t0 = (i0 = i) && attrInterpolateNS(fullname, i);
    return t0;
  }
  tween._value = value;
  return tween;
}
function attrTween(name, value) {
  var t0, i0;
  function tween() {
    var i = value.apply(this, arguments);
    if (i !== i0)
      t0 = (i0 = i) && attrInterpolate(name, i);
    return t0;
  }
  tween._value = value;
  return tween;
}
function transition_attrTween(name, value) {
  var key = "attr." + name;
  if (arguments.length < 2)
    return (key = this.tween(key)) && key._value;
  if (value == null)
    return this.tween(key, null);
  if (typeof value !== "function")
    throw new Error();
  var fullname = namespace(name);
  return this.tween(key, (fullname.local ? attrTweenNS : attrTween)(fullname, value));
}
function delayFunction(id2, value) {
  return function() {
    init(this, id2).delay = +value.apply(this, arguments);
  };
}
function delayConstant(id2, value) {
  return value = +value, function() {
    init(this, id2).delay = value;
  };
}
function transition_delay(value) {
  var id2 = this._id;
  return arguments.length ? this.each((typeof value === "function" ? delayFunction : delayConstant)(id2, value)) : get$1(this.node(), id2).delay;
}
function durationFunction(id2, value) {
  return function() {
    set$1(this, id2).duration = +value.apply(this, arguments);
  };
}
function durationConstant(id2, value) {
  return value = +value, function() {
    set$1(this, id2).duration = value;
  };
}
function transition_duration(value) {
  var id2 = this._id;
  return arguments.length ? this.each((typeof value === "function" ? durationFunction : durationConstant)(id2, value)) : get$1(this.node(), id2).duration;
}
function easeConstant(id2, value) {
  if (typeof value !== "function")
    throw new Error();
  return function() {
    set$1(this, id2).ease = value;
  };
}
function transition_ease(value) {
  var id2 = this._id;
  return arguments.length ? this.each(easeConstant(id2, value)) : get$1(this.node(), id2).ease;
}
function easeVarying(id2, value) {
  return function() {
    var v = value.apply(this, arguments);
    if (typeof v !== "function")
      throw new Error();
    set$1(this, id2).ease = v;
  };
}
function transition_easeVarying(value) {
  if (typeof value !== "function")
    throw new Error();
  return this.each(easeVarying(this._id, value));
}
function transition_filter(match) {
  if (typeof match !== "function")
    match = matcher(match);
  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = [], node, i = 0; i < n; ++i) {
      if ((node = group[i]) && match.call(node, node.__data__, i, group)) {
        subgroup.push(node);
      }
    }
  }
  return new Transition(subgroups, this._parents, this._name, this._id);
}
function transition_merge(transition) {
  if (transition._id !== this._id)
    throw new Error();
  for (var groups0 = this._groups, groups1 = transition._groups, m0 = groups0.length, m1 = groups1.length, m = Math.min(m0, m1), merges = new Array(m0), j = 0; j < m; ++j) {
    for (var group0 = groups0[j], group1 = groups1[j], n = group0.length, merge = merges[j] = new Array(n), node, i = 0; i < n; ++i) {
      if (node = group0[i] || group1[i]) {
        merge[i] = node;
      }
    }
  }
  for (; j < m0; ++j) {
    merges[j] = groups0[j];
  }
  return new Transition(merges, this._parents, this._name, this._id);
}
function start(name) {
  return (name + "").trim().split(/^|\s+/).every(function(t) {
    var i = t.indexOf(".");
    if (i >= 0)
      t = t.slice(0, i);
    return !t || t === "start";
  });
}
function onFunction(id2, name, listener) {
  var on0, on1, sit = start(name) ? init : set$1;
  return function() {
    var schedule2 = sit(this, id2), on = schedule2.on;
    if (on !== on0)
      (on1 = (on0 = on).copy()).on(name, listener);
    schedule2.on = on1;
  };
}
function transition_on(name, listener) {
  var id2 = this._id;
  return arguments.length < 2 ? get$1(this.node(), id2).on.on(name) : this.each(onFunction(id2, name, listener));
}
function removeFunction(id2) {
  return function() {
    var parent = this.parentNode;
    for (var i in this.__transition)
      if (+i !== id2)
        return;
    if (parent)
      parent.removeChild(this);
  };
}
function transition_remove() {
  return this.on("end.remove", removeFunction(this._id));
}
function transition_select(select2) {
  var name = this._name, id2 = this._id;
  if (typeof select2 !== "function")
    select2 = selector(select2);
  for (var groups = this._groups, m = groups.length, subgroups = new Array(m), j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, subgroup = subgroups[j] = new Array(n), node, subnode, i = 0; i < n; ++i) {
      if ((node = group[i]) && (subnode = select2.call(node, node.__data__, i, group))) {
        if ("__data__" in node)
          subnode.__data__ = node.__data__;
        subgroup[i] = subnode;
        schedule(subgroup[i], name, id2, i, subgroup, get$1(node, id2));
      }
    }
  }
  return new Transition(subgroups, this._parents, name, id2);
}
function transition_selectAll(select2) {
  var name = this._name, id2 = this._id;
  if (typeof select2 !== "function")
    select2 = selectorAll(select2);
  for (var groups = this._groups, m = groups.length, subgroups = [], parents = [], j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        for (var children2 = select2.call(node, node.__data__, i, group), child, inherit2 = get$1(node, id2), k = 0, l = children2.length; k < l; ++k) {
          if (child = children2[k]) {
            schedule(child, name, id2, k, children2, inherit2);
          }
        }
        subgroups.push(children2);
        parents.push(node);
      }
    }
  }
  return new Transition(subgroups, parents, name, id2);
}
var Selection2 = selection.prototype.constructor;
function transition_selection() {
  return new Selection2(this._groups, this._parents);
}
function styleNull(name, interpolate2) {
  var string00, string10, interpolate0;
  return function() {
    var string0 = styleValue(this, name), string1 = (this.style.removeProperty(name), styleValue(this, name));
    return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : interpolate0 = interpolate2(string00 = string0, string10 = string1);
  };
}
function styleRemove2(name) {
  return function() {
    this.style.removeProperty(name);
  };
}
function styleConstant2(name, interpolate2, value1) {
  var string00, string1 = value1 + "", interpolate0;
  return function() {
    var string0 = styleValue(this, name);
    return string0 === string1 ? null : string0 === string00 ? interpolate0 : interpolate0 = interpolate2(string00 = string0, value1);
  };
}
function styleFunction2(name, interpolate2, value) {
  var string00, string10, interpolate0;
  return function() {
    var string0 = styleValue(this, name), value1 = value(this), string1 = value1 + "";
    if (value1 == null)
      string1 = value1 = (this.style.removeProperty(name), styleValue(this, name));
    return string0 === string1 ? null : string0 === string00 && string1 === string10 ? interpolate0 : (string10 = string1, interpolate0 = interpolate2(string00 = string0, value1));
  };
}
function styleMaybeRemove(id2, name) {
  var on0, on1, listener0, key = "style." + name, event = "end." + key, remove2;
  return function() {
    var schedule2 = set$1(this, id2), on = schedule2.on, listener = schedule2.value[key] == null ? remove2 || (remove2 = styleRemove2(name)) : void 0;
    if (on !== on0 || listener0 !== listener)
      (on1 = (on0 = on).copy()).on(event, listener0 = listener);
    schedule2.on = on1;
  };
}
function transition_style(name, value, priority) {
  var i = (name += "") === "transform" ? interpolateTransformCss : interpolate;
  return value == null ? this.styleTween(name, styleNull(name, i)).on("end.style." + name, styleRemove2(name)) : typeof value === "function" ? this.styleTween(name, styleFunction2(name, i, tweenValue(this, "style." + name, value))).each(styleMaybeRemove(this._id, name)) : this.styleTween(name, styleConstant2(name, i, value), priority).on("end.style." + name, null);
}
function styleInterpolate(name, i, priority) {
  return function(t) {
    this.style.setProperty(name, i.call(this, t), priority);
  };
}
function styleTween(name, value, priority) {
  var t, i0;
  function tween() {
    var i = value.apply(this, arguments);
    if (i !== i0)
      t = (i0 = i) && styleInterpolate(name, i, priority);
    return t;
  }
  tween._value = value;
  return tween;
}
function transition_styleTween(name, value, priority) {
  var key = "style." + (name += "");
  if (arguments.length < 2)
    return (key = this.tween(key)) && key._value;
  if (value == null)
    return this.tween(key, null);
  if (typeof value !== "function")
    throw new Error();
  return this.tween(key, styleTween(name, value, priority == null ? "" : priority));
}
function textConstant2(value) {
  return function() {
    this.textContent = value;
  };
}
function textFunction2(value) {
  return function() {
    var value1 = value(this);
    this.textContent = value1 == null ? "" : value1;
  };
}
function transition_text(value) {
  return this.tween("text", typeof value === "function" ? textFunction2(tweenValue(this, "text", value)) : textConstant2(value == null ? "" : value + ""));
}
function textInterpolate(i) {
  return function(t) {
    this.textContent = i.call(this, t);
  };
}
function textTween(value) {
  var t0, i0;
  function tween() {
    var i = value.apply(this, arguments);
    if (i !== i0)
      t0 = (i0 = i) && textInterpolate(i);
    return t0;
  }
  tween._value = value;
  return tween;
}
function transition_textTween(value) {
  var key = "text";
  if (arguments.length < 1)
    return (key = this.tween(key)) && key._value;
  if (value == null)
    return this.tween(key, null);
  if (typeof value !== "function")
    throw new Error();
  return this.tween(key, textTween(value));
}
function transition_transition() {
  var name = this._name, id0 = this._id, id1 = newId();
  for (var groups = this._groups, m = groups.length, j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        var inherit2 = get$1(node, id0);
        schedule(node, name, id1, i, group, {
          time: inherit2.time + inherit2.delay + inherit2.duration,
          delay: 0,
          duration: inherit2.duration,
          ease: inherit2.ease
        });
      }
    }
  }
  return new Transition(groups, this._parents, name, id1);
}
function transition_end() {
  var on0, on1, that = this, id2 = that._id, size = that.size();
  return new Promise(function(resolve, reject) {
    var cancel = {value: reject}, end = {value: function() {
      if (--size === 0)
        resolve();
    }};
    that.each(function() {
      var schedule2 = set$1(this, id2), on = schedule2.on;
      if (on !== on0) {
        on1 = (on0 = on).copy();
        on1._.cancel.push(cancel);
        on1._.interrupt.push(cancel);
        on1._.end.push(end);
      }
      schedule2.on = on1;
    });
    if (size === 0)
      resolve();
  });
}
var id = 0;
function Transition(groups, parents, name, id2) {
  this._groups = groups;
  this._parents = parents;
  this._name = name;
  this._id = id2;
}
function newId() {
  return ++id;
}
var selection_prototype = selection.prototype;
Transition.prototype = {
  constructor: Transition,
  select: transition_select,
  selectAll: transition_selectAll,
  selectChild: selection_prototype.selectChild,
  selectChildren: selection_prototype.selectChildren,
  filter: transition_filter,
  merge: transition_merge,
  selection: transition_selection,
  transition: transition_transition,
  call: selection_prototype.call,
  nodes: selection_prototype.nodes,
  node: selection_prototype.node,
  size: selection_prototype.size,
  empty: selection_prototype.empty,
  each: selection_prototype.each,
  on: transition_on,
  attr: transition_attr,
  attrTween: transition_attrTween,
  style: transition_style,
  styleTween: transition_styleTween,
  text: transition_text,
  textTween: transition_textTween,
  remove: transition_remove,
  tween: transition_tween,
  delay: transition_delay,
  duration: transition_duration,
  ease: transition_ease,
  easeVarying: transition_easeVarying,
  end: transition_end,
  [Symbol.iterator]: selection_prototype[Symbol.iterator]
};
function cubicInOut(t) {
  return ((t *= 2) <= 1 ? t * t * t : (t -= 2) * t * t + 2) / 2;
}
var defaultTiming = {
  time: null,
  delay: 0,
  duration: 250,
  ease: cubicInOut
};
function inherit(node, id2) {
  var timing;
  while (!(timing = node.__transition) || !(timing = timing[id2])) {
    if (!(node = node.parentNode)) {
      throw new Error(`transition ${id2} not found`);
    }
  }
  return timing;
}
function selection_transition(name) {
  var id2, timing;
  if (name instanceof Transition) {
    id2 = name._id, name = name._name;
  } else {
    id2 = newId(), (timing = defaultTiming).time = now(), name = name == null ? null : name + "";
  }
  for (var groups = this._groups, m = groups.length, j = 0; j < m; ++j) {
    for (var group = groups[j], n = group.length, node, i = 0; i < n; ++i) {
      if (node = group[i]) {
        schedule(node, name, id2, i, group, timing || inherit(node, id2));
      }
    }
  }
  return new Transition(groups, this._parents, name, id2);
}
selection.prototype.interrupt = selection_interrupt;
selection.prototype.transition = selection_transition;
var constant3 = (x) => () => x;
function ZoomEvent(type, {
  sourceEvent: sourceEvent2,
  target,
  transform: transform2,
  dispatch: dispatch2
}) {
  Object.defineProperties(this, {
    type: {value: type, enumerable: true, configurable: true},
    sourceEvent: {value: sourceEvent2, enumerable: true, configurable: true},
    target: {value: target, enumerable: true, configurable: true},
    transform: {value: transform2, enumerable: true, configurable: true},
    _: {value: dispatch2}
  });
}
function Transform(k, x, y) {
  this.k = k;
  this.x = x;
  this.y = y;
}
Transform.prototype = {
  constructor: Transform,
  scale: function(k) {
    return k === 1 ? this : new Transform(this.k * k, this.x, this.y);
  },
  translate: function(x, y) {
    return x === 0 & y === 0 ? this : new Transform(this.k, this.x + this.k * x, this.y + this.k * y);
  },
  apply: function(point) {
    return [point[0] * this.k + this.x, point[1] * this.k + this.y];
  },
  applyX: function(x) {
    return x * this.k + this.x;
  },
  applyY: function(y) {
    return y * this.k + this.y;
  },
  invert: function(location) {
    return [(location[0] - this.x) / this.k, (location[1] - this.y) / this.k];
  },
  invertX: function(x) {
    return (x - this.x) / this.k;
  },
  invertY: function(y) {
    return (y - this.y) / this.k;
  },
  rescaleX: function(x) {
    return x.copy().domain(x.range().map(this.invertX, this).map(x.invert, x));
  },
  rescaleY: function(y) {
    return y.copy().domain(y.range().map(this.invertY, this).map(y.invert, y));
  },
  toString: function() {
    return "translate(" + this.x + "," + this.y + ") scale(" + this.k + ")";
  }
};
var identity$1 = new Transform(1, 0, 0);
transform.prototype = Transform.prototype;
function transform(node) {
  while (!node.__zoom)
    if (!(node = node.parentNode))
      return identity$1;
  return node.__zoom;
}
function nopropagation(event) {
  event.stopImmediatePropagation();
}
function noevent$1(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}
function defaultFilter(event) {
  return (!event.ctrlKey || event.type === "wheel") && !event.button;
}
function defaultExtent() {
  var e = this;
  if (e instanceof SVGElement) {
    e = e.ownerSVGElement || e;
    if (e.hasAttribute("viewBox")) {
      e = e.viewBox.baseVal;
      return [[e.x, e.y], [e.x + e.width, e.y + e.height]];
    }
    return [[0, 0], [e.width.baseVal.value, e.height.baseVal.value]];
  }
  return [[0, 0], [e.clientWidth, e.clientHeight]];
}
function defaultTransform() {
  return this.__zoom || identity$1;
}
function defaultWheelDelta(event) {
  return -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 2e-3) * (event.ctrlKey ? 10 : 1);
}
function defaultTouchable() {
  return navigator.maxTouchPoints || "ontouchstart" in this;
}
function defaultConstrain(transform2, extent, translateExtent) {
  var dx0 = transform2.invertX(extent[0][0]) - translateExtent[0][0], dx1 = transform2.invertX(extent[1][0]) - translateExtent[1][0], dy0 = transform2.invertY(extent[0][1]) - translateExtent[0][1], dy1 = transform2.invertY(extent[1][1]) - translateExtent[1][1];
  return transform2.translate(dx1 > dx0 ? (dx0 + dx1) / 2 : Math.min(0, dx0) || Math.max(0, dx1), dy1 > dy0 ? (dy0 + dy1) / 2 : Math.min(0, dy0) || Math.max(0, dy1));
}
function zoom() {
  var filter2 = defaultFilter, extent = defaultExtent, constrain = defaultConstrain, wheelDelta = defaultWheelDelta, touchable = defaultTouchable, scaleExtent = [0, Infinity], translateExtent = [[-Infinity, -Infinity], [Infinity, Infinity]], duration = 250, interpolate2 = interpolateZoom, listeners = dispatch("start", "zoom", "end"), touchstarting, touchfirst, touchending, touchDelay = 500, wheelDelay = 150, clickDistance2 = 0, tapDistance = 10;
  function zoom2(selection2) {
    selection2.property("__zoom", defaultTransform).on("wheel.zoom", wheeled, {passive: false}).on("mousedown.zoom", mousedowned).on("dblclick.zoom", dblclicked).filter(touchable).on("touchstart.zoom", touchstarted).on("touchmove.zoom", touchmoved).on("touchend.zoom touchcancel.zoom", touchended).style("-webkit-tap-highlight-color", "rgba(0,0,0,0)");
  }
  zoom2.transform = function(collection, transform2, point, event) {
    var selection2 = collection.selection ? collection.selection() : collection;
    selection2.property("__zoom", defaultTransform);
    if (collection !== selection2) {
      schedule2(collection, transform2, point, event);
    } else {
      selection2.interrupt().each(function() {
        gesture(this, arguments).event(event).start().zoom(null, typeof transform2 === "function" ? transform2.apply(this, arguments) : transform2).end();
      });
    }
  };
  zoom2.scaleBy = function(selection2, k, p, event) {
    zoom2.scaleTo(selection2, function() {
      var k0 = this.__zoom.k, k1 = typeof k === "function" ? k.apply(this, arguments) : k;
      return k0 * k1;
    }, p, event);
  };
  zoom2.scaleTo = function(selection2, k, p, event) {
    zoom2.transform(selection2, function() {
      var e = extent.apply(this, arguments), t0 = this.__zoom, p0 = p == null ? centroid(e) : typeof p === "function" ? p.apply(this, arguments) : p, p1 = t0.invert(p0), k1 = typeof k === "function" ? k.apply(this, arguments) : k;
      return constrain(translate(scale(t0, k1), p0, p1), e, translateExtent);
    }, p, event);
  };
  zoom2.translateBy = function(selection2, x, y, event) {
    zoom2.transform(selection2, function() {
      return constrain(this.__zoom.translate(typeof x === "function" ? x.apply(this, arguments) : x, typeof y === "function" ? y.apply(this, arguments) : y), extent.apply(this, arguments), translateExtent);
    }, null, event);
  };
  zoom2.translateTo = function(selection2, x, y, p, event) {
    zoom2.transform(selection2, function() {
      var e = extent.apply(this, arguments), t = this.__zoom, p0 = p == null ? centroid(e) : typeof p === "function" ? p.apply(this, arguments) : p;
      return constrain(identity$1.translate(p0[0], p0[1]).scale(t.k).translate(typeof x === "function" ? -x.apply(this, arguments) : -x, typeof y === "function" ? -y.apply(this, arguments) : -y), e, translateExtent);
    }, p, event);
  };
  function scale(transform2, k) {
    k = Math.max(scaleExtent[0], Math.min(scaleExtent[1], k));
    return k === transform2.k ? transform2 : new Transform(k, transform2.x, transform2.y);
  }
  function translate(transform2, p0, p1) {
    var x = p0[0] - p1[0] * transform2.k, y = p0[1] - p1[1] * transform2.k;
    return x === transform2.x && y === transform2.y ? transform2 : new Transform(transform2.k, x, y);
  }
  function centroid(extent2) {
    return [(+extent2[0][0] + +extent2[1][0]) / 2, (+extent2[0][1] + +extent2[1][1]) / 2];
  }
  function schedule2(transition, transform2, point, event) {
    transition.on("start.zoom", function() {
      gesture(this, arguments).event(event).start();
    }).on("interrupt.zoom end.zoom", function() {
      gesture(this, arguments).event(event).end();
    }).tween("zoom", function() {
      var that = this, args = arguments, g = gesture(that, args).event(event), e = extent.apply(that, args), p = point == null ? centroid(e) : typeof point === "function" ? point.apply(that, args) : point, w = Math.max(e[1][0] - e[0][0], e[1][1] - e[0][1]), a = that.__zoom, b = typeof transform2 === "function" ? transform2.apply(that, args) : transform2, i = interpolate2(a.invert(p).concat(w / a.k), b.invert(p).concat(w / b.k));
      return function(t) {
        if (t === 1)
          t = b;
        else {
          var l = i(t), k = w / l[2];
          t = new Transform(k, p[0] - l[0] * k, p[1] - l[1] * k);
        }
        g.zoom(null, t);
      };
    });
  }
  function gesture(that, args, clean) {
    return !clean && that.__zooming || new Gesture(that, args);
  }
  function Gesture(that, args) {
    this.that = that;
    this.args = args;
    this.active = 0;
    this.sourceEvent = null;
    this.extent = extent.apply(that, args);
    this.taps = 0;
  }
  Gesture.prototype = {
    event: function(event) {
      if (event)
        this.sourceEvent = event;
      return this;
    },
    start: function() {
      if (++this.active === 1) {
        this.that.__zooming = this;
        this.emit("start");
      }
      return this;
    },
    zoom: function(key, transform2) {
      if (this.mouse && key !== "mouse")
        this.mouse[1] = transform2.invert(this.mouse[0]);
      if (this.touch0 && key !== "touch")
        this.touch0[1] = transform2.invert(this.touch0[0]);
      if (this.touch1 && key !== "touch")
        this.touch1[1] = transform2.invert(this.touch1[0]);
      this.that.__zoom = transform2;
      this.emit("zoom");
      return this;
    },
    end: function() {
      if (--this.active === 0) {
        delete this.that.__zooming;
        this.emit("end");
      }
      return this;
    },
    emit: function(type) {
      var d = select(this.that).datum();
      listeners.call(type, this.that, new ZoomEvent(type, {
        sourceEvent: this.sourceEvent,
        target: zoom2,
        type,
        transform: this.that.__zoom,
        dispatch: listeners
      }), d);
    }
  };
  function wheeled(event, ...args) {
    if (!filter2.apply(this, arguments))
      return;
    var g = gesture(this, args).event(event), t = this.__zoom, k = Math.max(scaleExtent[0], Math.min(scaleExtent[1], t.k * Math.pow(2, wheelDelta.apply(this, arguments)))), p = pointer(event);
    if (g.wheel) {
      if (g.mouse[0][0] !== p[0] || g.mouse[0][1] !== p[1]) {
        g.mouse[1] = t.invert(g.mouse[0] = p);
      }
      clearTimeout(g.wheel);
    } else if (t.k === k)
      return;
    else {
      g.mouse = [p, t.invert(p)];
      interrupt(this);
      g.start();
    }
    noevent$1(event);
    g.wheel = setTimeout(wheelidled, wheelDelay);
    g.zoom("mouse", constrain(translate(scale(t, k), g.mouse[0], g.mouse[1]), g.extent, translateExtent));
    function wheelidled() {
      g.wheel = null;
      g.end();
    }
  }
  function mousedowned(event, ...args) {
    if (touchending || !filter2.apply(this, arguments))
      return;
    var currentTarget = event.currentTarget, g = gesture(this, args, true).event(event), v = select(event.view).on("mousemove.zoom", mousemoved, true).on("mouseup.zoom", mouseupped, true), p = pointer(event, currentTarget), x0 = event.clientX, y0 = event.clientY;
    dragDisable(event.view);
    nopropagation(event);
    g.mouse = [p, this.__zoom.invert(p)];
    interrupt(this);
    g.start();
    function mousemoved(event2) {
      noevent$1(event2);
      if (!g.moved) {
        var dx = event2.clientX - x0, dy = event2.clientY - y0;
        g.moved = dx * dx + dy * dy > clickDistance2;
      }
      g.event(event2).zoom("mouse", constrain(translate(g.that.__zoom, g.mouse[0] = pointer(event2, currentTarget), g.mouse[1]), g.extent, translateExtent));
    }
    function mouseupped(event2) {
      v.on("mousemove.zoom mouseup.zoom", null);
      yesdrag(event2.view, g.moved);
      noevent$1(event2);
      g.event(event2).end();
    }
  }
  function dblclicked(event, ...args) {
    if (!filter2.apply(this, arguments))
      return;
    var t0 = this.__zoom, p0 = pointer(event.changedTouches ? event.changedTouches[0] : event, this), p1 = t0.invert(p0), k1 = t0.k * (event.shiftKey ? 0.5 : 2), t1 = constrain(translate(scale(t0, k1), p0, p1), extent.apply(this, args), translateExtent);
    noevent$1(event);
    if (duration > 0)
      select(this).transition().duration(duration).call(schedule2, t1, p0, event);
    else
      select(this).call(zoom2.transform, t1, p0, event);
  }
  function touchstarted(event, ...args) {
    if (!filter2.apply(this, arguments))
      return;
    var touches = event.touches, n = touches.length, g = gesture(this, args, event.changedTouches.length === n).event(event), started, i, t, p;
    nopropagation(event);
    for (i = 0; i < n; ++i) {
      t = touches[i], p = pointer(t, this);
      p = [p, this.__zoom.invert(p), t.identifier];
      if (!g.touch0)
        g.touch0 = p, started = true, g.taps = 1 + !!touchstarting;
      else if (!g.touch1 && g.touch0[2] !== p[2])
        g.touch1 = p, g.taps = 0;
    }
    if (touchstarting)
      touchstarting = clearTimeout(touchstarting);
    if (started) {
      if (g.taps < 2)
        touchfirst = p[0], touchstarting = setTimeout(function() {
          touchstarting = null;
        }, touchDelay);
      interrupt(this);
      g.start();
    }
  }
  function touchmoved(event, ...args) {
    if (!this.__zooming)
      return;
    var g = gesture(this, args).event(event), touches = event.changedTouches, n = touches.length, i, t, p, l;
    noevent$1(event);
    for (i = 0; i < n; ++i) {
      t = touches[i], p = pointer(t, this);
      if (g.touch0 && g.touch0[2] === t.identifier)
        g.touch0[0] = p;
      else if (g.touch1 && g.touch1[2] === t.identifier)
        g.touch1[0] = p;
    }
    t = g.that.__zoom;
    if (g.touch1) {
      var p0 = g.touch0[0], l0 = g.touch0[1], p1 = g.touch1[0], l1 = g.touch1[1], dp = (dp = p1[0] - p0[0]) * dp + (dp = p1[1] - p0[1]) * dp, dl = (dl = l1[0] - l0[0]) * dl + (dl = l1[1] - l0[1]) * dl;
      t = scale(t, Math.sqrt(dp / dl));
      p = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      l = [(l0[0] + l1[0]) / 2, (l0[1] + l1[1]) / 2];
    } else if (g.touch0)
      p = g.touch0[0], l = g.touch0[1];
    else
      return;
    g.zoom("touch", constrain(translate(t, p, l), g.extent, translateExtent));
  }
  function touchended(event, ...args) {
    if (!this.__zooming)
      return;
    var g = gesture(this, args).event(event), touches = event.changedTouches, n = touches.length, i, t;
    nopropagation(event);
    if (touchending)
      clearTimeout(touchending);
    touchending = setTimeout(function() {
      touchending = null;
    }, touchDelay);
    for (i = 0; i < n; ++i) {
      t = touches[i];
      if (g.touch0 && g.touch0[2] === t.identifier)
        delete g.touch0;
      else if (g.touch1 && g.touch1[2] === t.identifier)
        delete g.touch1;
    }
    if (g.touch1 && !g.touch0)
      g.touch0 = g.touch1, delete g.touch1;
    if (g.touch0)
      g.touch0[1] = this.__zoom.invert(g.touch0[0]);
    else {
      g.end();
      if (g.taps === 2) {
        t = pointer(t, this);
        if (Math.hypot(touchfirst[0] - t[0], touchfirst[1] - t[1]) < tapDistance) {
          var p = select(this).on("dblclick.zoom");
          if (p)
            p.apply(this, arguments);
        }
      }
    }
  }
  zoom2.wheelDelta = function(_) {
    return arguments.length ? (wheelDelta = typeof _ === "function" ? _ : constant3(+_), zoom2) : wheelDelta;
  };
  zoom2.filter = function(_) {
    return arguments.length ? (filter2 = typeof _ === "function" ? _ : constant3(!!_), zoom2) : filter2;
  };
  zoom2.touchable = function(_) {
    return arguments.length ? (touchable = typeof _ === "function" ? _ : constant3(!!_), zoom2) : touchable;
  };
  zoom2.extent = function(_) {
    return arguments.length ? (extent = typeof _ === "function" ? _ : constant3([[+_[0][0], +_[0][1]], [+_[1][0], +_[1][1]]]), zoom2) : extent;
  };
  zoom2.scaleExtent = function(_) {
    return arguments.length ? (scaleExtent[0] = +_[0], scaleExtent[1] = +_[1], zoom2) : [scaleExtent[0], scaleExtent[1]];
  };
  zoom2.translateExtent = function(_) {
    return arguments.length ? (translateExtent[0][0] = +_[0][0], translateExtent[1][0] = +_[1][0], translateExtent[0][1] = +_[0][1], translateExtent[1][1] = +_[1][1], zoom2) : [[translateExtent[0][0], translateExtent[0][1]], [translateExtent[1][0], translateExtent[1][1]]];
  };
  zoom2.constrain = function(_) {
    return arguments.length ? (constrain = _, zoom2) : constrain;
  };
  zoom2.duration = function(_) {
    return arguments.length ? (duration = +_, zoom2) : duration;
  };
  zoom2.interpolate = function(_) {
    return arguments.length ? (interpolate2 = _, zoom2) : interpolate2;
  };
  zoom2.on = function() {
    var value = listeners.on.apply(listeners, arguments);
    return value === listeners ? zoom2 : value;
  };
  zoom2.clickDistance = function(_) {
    return arguments.length ? (clickDistance2 = (_ = +_) * _, zoom2) : Math.sqrt(clickDistance2);
  };
  zoom2.tapDistance = function(_) {
    return arguments.length ? (tapDistance = +_, zoom2) : tapDistance;
  };
  return zoom2;
}

// build/_snowpack/pkg/pica.js
function createCommonjsModule(fn, basedir, module) {
  return module = {
    path: basedir,
    exports: {},
    require: function(path, base) {
      return commonjsRequire(path, base === void 0 || base === null ? module.path : base);
    }
  }, fn(module, module.exports), module.exports;
}
function commonjsRequire() {
  throw new Error("Dynamic requires are not currently supported by @rollup/plugin-commonjs");
}
var pica = createCommonjsModule(function(module, exports) {
  /*!
  
  pica
  https://github.com/nodeca/pica
  
  */
  (function(f) {
    {
      module.exports = f();
    }
  })(function() {
    return function() {
      function r(e, n, t) {
        function o(i2, f) {
          if (!n[i2]) {
            if (!e[i2]) {
              var c = typeof commonjsRequire == "function" && commonjsRequire;
              if (!f && c)
                return c(i2, true);
              if (u)
                return u(i2, true);
              var a = new Error("Cannot find module '" + i2 + "'");
              throw a.code = "MODULE_NOT_FOUND", a;
            }
            var p = n[i2] = {exports: {}};
            e[i2][0].call(p.exports, function(r2) {
              var n2 = e[i2][1][r2];
              return o(n2 || r2);
            }, p, p.exports, r, e, n, t);
          }
          return n[i2].exports;
        }
        for (var u = typeof commonjsRequire == "function" && commonjsRequire, i = 0; i < t.length; i++)
          o(t[i]);
        return o;
      }
      return r;
    }()({1: [function(_dereq_, module2, exports2) {
      var Multimath = _dereq_("multimath");
      var mm_unsharp_mask = _dereq_("./mm_unsharp_mask");
      var mm_resize = _dereq_("./mm_resize");
      function MathLib(requested_features) {
        var __requested_features = requested_features || [];
        var features = {
          js: __requested_features.indexOf("js") >= 0,
          wasm: __requested_features.indexOf("wasm") >= 0
        };
        Multimath.call(this, features);
        this.features = {
          js: features.js,
          wasm: features.wasm && this.has_wasm()
        };
        this.use(mm_unsharp_mask);
        this.use(mm_resize);
      }
      MathLib.prototype = Object.create(Multimath.prototype);
      MathLib.prototype.constructor = MathLib;
      MathLib.prototype.resizeAndUnsharp = function resizeAndUnsharp(options, cache) {
        var result = this.resize(options, cache);
        if (options.unsharpAmount) {
          this.unsharp_mask(result, options.toWidth, options.toHeight, options.unsharpAmount, options.unsharpRadius, options.unsharpThreshold);
        }
        return result;
      };
      module2.exports = MathLib;
    }, {"./mm_resize": 4, "./mm_unsharp_mask": 9, multimath: 19}], 2: [function(_dereq_, module2, exports2) {
      function clampTo8(i) {
        return i < 0 ? 0 : i > 255 ? 255 : i;
      }
      function clampNegative(i) {
        return i >= 0 ? i : 0;
      }
      function convolveHor(src, dest, srcW, srcH, destW, filters) {
        var r, g, b, a;
        var filterPtr, filterShift, filterSize;
        var srcPtr, srcY, destX, filterVal;
        var srcOffset = 0, destOffset = 0;
        for (srcY = 0; srcY < srcH; srcY++) {
          filterPtr = 0;
          for (destX = 0; destX < destW; destX++) {
            filterShift = filters[filterPtr++];
            filterSize = filters[filterPtr++];
            srcPtr = srcOffset + filterShift * 4 | 0;
            r = g = b = a = 0;
            for (; filterSize > 0; filterSize--) {
              filterVal = filters[filterPtr++];
              a = a + filterVal * src[srcPtr + 3] | 0;
              b = b + filterVal * src[srcPtr + 2] | 0;
              g = g + filterVal * src[srcPtr + 1] | 0;
              r = r + filterVal * src[srcPtr] | 0;
              srcPtr = srcPtr + 4 | 0;
            }
            dest[destOffset + 3] = clampNegative(a >> 7);
            dest[destOffset + 2] = clampNegative(b >> 7);
            dest[destOffset + 1] = clampNegative(g >> 7);
            dest[destOffset] = clampNegative(r >> 7);
            destOffset = destOffset + srcH * 4 | 0;
          }
          destOffset = (srcY + 1) * 4 | 0;
          srcOffset = (srcY + 1) * srcW * 4 | 0;
        }
      }
      function convolveVert(src, dest, srcW, srcH, destW, filters) {
        var r, g, b, a;
        var filterPtr, filterShift, filterSize;
        var srcPtr, srcY, destX, filterVal;
        var srcOffset = 0, destOffset = 0;
        for (srcY = 0; srcY < srcH; srcY++) {
          filterPtr = 0;
          for (destX = 0; destX < destW; destX++) {
            filterShift = filters[filterPtr++];
            filterSize = filters[filterPtr++];
            srcPtr = srcOffset + filterShift * 4 | 0;
            r = g = b = a = 0;
            for (; filterSize > 0; filterSize--) {
              filterVal = filters[filterPtr++];
              a = a + filterVal * src[srcPtr + 3] | 0;
              b = b + filterVal * src[srcPtr + 2] | 0;
              g = g + filterVal * src[srcPtr + 1] | 0;
              r = r + filterVal * src[srcPtr] | 0;
              srcPtr = srcPtr + 4 | 0;
            }
            r >>= 7;
            g >>= 7;
            b >>= 7;
            a >>= 7;
            dest[destOffset + 3] = clampTo8(a + (1 << 13) >> 14);
            dest[destOffset + 2] = clampTo8(b + (1 << 13) >> 14);
            dest[destOffset + 1] = clampTo8(g + (1 << 13) >> 14);
            dest[destOffset] = clampTo8(r + (1 << 13) >> 14);
            destOffset = destOffset + srcH * 4 | 0;
          }
          destOffset = (srcY + 1) * 4 | 0;
          srcOffset = (srcY + 1) * srcW * 4 | 0;
        }
      }
      function convolveHorWithPre(src, dest, srcW, srcH, destW, filters) {
        var r, g, b, a, alpha;
        var filterPtr, filterShift, filterSize;
        var srcPtr, srcY, destX, filterVal;
        var srcOffset = 0, destOffset = 0;
        for (srcY = 0; srcY < srcH; srcY++) {
          filterPtr = 0;
          for (destX = 0; destX < destW; destX++) {
            filterShift = filters[filterPtr++];
            filterSize = filters[filterPtr++];
            srcPtr = srcOffset + filterShift * 4 | 0;
            r = g = b = a = 0;
            for (; filterSize > 0; filterSize--) {
              filterVal = filters[filterPtr++];
              alpha = src[srcPtr + 3];
              a = a + filterVal * alpha | 0;
              b = b + filterVal * src[srcPtr + 2] * alpha | 0;
              g = g + filterVal * src[srcPtr + 1] * alpha | 0;
              r = r + filterVal * src[srcPtr] * alpha | 0;
              srcPtr = srcPtr + 4 | 0;
            }
            b = b / 255 | 0;
            g = g / 255 | 0;
            r = r / 255 | 0;
            dest[destOffset + 3] = clampNegative(a >> 7);
            dest[destOffset + 2] = clampNegative(b >> 7);
            dest[destOffset + 1] = clampNegative(g >> 7);
            dest[destOffset] = clampNegative(r >> 7);
            destOffset = destOffset + srcH * 4 | 0;
          }
          destOffset = (srcY + 1) * 4 | 0;
          srcOffset = (srcY + 1) * srcW * 4 | 0;
        }
      }
      function convolveVertWithPre(src, dest, srcW, srcH, destW, filters) {
        var r, g, b, a;
        var filterPtr, filterShift, filterSize;
        var srcPtr, srcY, destX, filterVal;
        var srcOffset = 0, destOffset = 0;
        for (srcY = 0; srcY < srcH; srcY++) {
          filterPtr = 0;
          for (destX = 0; destX < destW; destX++) {
            filterShift = filters[filterPtr++];
            filterSize = filters[filterPtr++];
            srcPtr = srcOffset + filterShift * 4 | 0;
            r = g = b = a = 0;
            for (; filterSize > 0; filterSize--) {
              filterVal = filters[filterPtr++];
              a = a + filterVal * src[srcPtr + 3] | 0;
              b = b + filterVal * src[srcPtr + 2] | 0;
              g = g + filterVal * src[srcPtr + 1] | 0;
              r = r + filterVal * src[srcPtr] | 0;
              srcPtr = srcPtr + 4 | 0;
            }
            r >>= 7;
            g >>= 7;
            b >>= 7;
            a >>= 7;
            a = clampTo8(a + (1 << 13) >> 14);
            if (a > 0) {
              r = r * 255 / a | 0;
              g = g * 255 / a | 0;
              b = b * 255 / a | 0;
            }
            dest[destOffset + 3] = a;
            dest[destOffset + 2] = clampTo8(b + (1 << 13) >> 14);
            dest[destOffset + 1] = clampTo8(g + (1 << 13) >> 14);
            dest[destOffset] = clampTo8(r + (1 << 13) >> 14);
            destOffset = destOffset + srcH * 4 | 0;
          }
          destOffset = (srcY + 1) * 4 | 0;
          srcOffset = (srcY + 1) * srcW * 4 | 0;
        }
      }
      module2.exports = {
        convolveHor,
        convolveVert,
        convolveHorWithPre,
        convolveVertWithPre
      };
    }, {}], 3: [function(_dereq_, module2, exports2) {
      module2.exports = "AGFzbQEAAAAADAZkeWxpbmsAAAAAAAEYA2AGf39/f39/AGAAAGAIf39/f39/f38AAg8BA2VudgZtZW1vcnkCAAADBwYBAAAAAAIGBgF/AEEACweUAQgRX193YXNtX2NhbGxfY3RvcnMAAAtjb252b2x2ZUhvcgABDGNvbnZvbHZlVmVydAACEmNvbnZvbHZlSG9yV2l0aFByZQADE2NvbnZvbHZlVmVydFdpdGhQcmUABApjb252b2x2ZUhWAAUMX19kc29faGFuZGxlAwAYX193YXNtX2FwcGx5X2RhdGFfcmVsb2NzAAAKyA4GAwABC4wDARB/AkAgA0UNACAERQ0AIANBAnQhFQNAQQAhE0EAIQsDQCALQQJqIQcCfyALQQF0IAVqIgYuAQIiC0UEQEEAIQhBACEGQQAhCUEAIQogBwwBCyASIAYuAQBqIQhBACEJQQAhCiALIRRBACEOIAchBkEAIQ8DQCAFIAZBAXRqLgEAIhAgACAIQQJ0aigCACIRQRh2bCAPaiEPIBFB/wFxIBBsIAlqIQkgEUEQdkH/AXEgEGwgDmohDiARQQh2Qf8BcSAQbCAKaiEKIAhBAWohCCAGQQFqIQYgFEEBayIUDQALIAlBB3UhCCAKQQd1IQYgDkEHdSEJIA9BB3UhCiAHIAtqCyELIAEgDEEBdCIHaiAIQQAgCEEAShs7AQAgASAHQQJyaiAGQQAgBkEAShs7AQAgASAHQQRyaiAJQQAgCUEAShs7AQAgASAHQQZyaiAKQQAgCkEAShs7AQAgDCAVaiEMIBNBAWoiEyAERw0ACyANQQFqIg0gAmwhEiANQQJ0IQwgAyANRw0ACwsL2gMBD38CQCADRQ0AIARFDQAgAkECdCEUA0AgCyEMQQAhE0EAIQIDQCACQQJqIQYCfyACQQF0IAVqIgcuAQIiAkUEQEEAIQhBACEHQQAhCkEAIQkgBgwBCyAHLgEAQQJ0IBJqIQhBACEJIAIhCkEAIQ0gBiEHQQAhDkEAIQ8DQCAFIAdBAXRqLgEAIhAgACAIQQF0IhFqLwEAbCAJaiEJIAAgEUEGcmovAQAgEGwgDmohDiAAIBFBBHJqLwEAIBBsIA9qIQ8gACARQQJyai8BACAQbCANaiENIAhBBGohCCAHQQFqIQcgCkEBayIKDQALIAlBB3UhCCANQQd1IQcgDkEHdSEKIA9BB3UhCSACIAZqCyECIAEgDEECdGogB0GAQGtBDnUiBkH/ASAGQf8BSBsiBkEAIAZBAEobQQh0QYD+A3EgCUGAQGtBDnUiBkH/ASAGQf8BSBsiBkEAIAZBAEobQRB0QYCA/AdxIApBgEBrQQ51IgZB/wEgBkH/AUgbIgZBACAGQQBKG0EYdHJyIAhBgEBrQQ51IgZB/wEgBkH/AUgbIgZBACAGQQBKG3I2AgAgAyAMaiEMIBNBAWoiEyAERw0ACyAUIAtBAWoiC2whEiADIAtHDQALCwuSAwEQfwJAIANFDQAgBEUNACADQQJ0IRUDQEEAIRNBACEGA0AgBkECaiEIAn8gBkEBdCAFaiIGLgECIgdFBEBBACEJQQAhDEEAIQ1BACEOIAgMAQsgEiAGLgEAaiEJQQAhDkEAIQ1BACEMIAchFEEAIQ8gCCEGA0AgBSAGQQF0ai4BACAAIAlBAnRqKAIAIhBBGHZsIhEgD2ohDyARIBBBEHZB/wFxbCAMaiEMIBEgEEEIdkH/AXFsIA1qIQ0gESAQQf8BcWwgDmohDiAJQQFqIQkgBkEBaiEGIBRBAWsiFA0ACyAPQQd1IQkgByAIagshBiABIApBAXQiCGogDkH/AW1BB3UiB0EAIAdBAEobOwEAIAEgCEECcmogDUH/AW1BB3UiB0EAIAdBAEobOwEAIAEgCEEEcmogDEH/AW1BB3UiB0EAIAdBAEobOwEAIAEgCEEGcmogCUEAIAlBAEobOwEAIAogFWohCiATQQFqIhMgBEcNAAsgC0EBaiILIAJsIRIgC0ECdCEKIAMgC0cNAAsLC4IEAQ9/AkAgA0UNACAERQ0AIAJBAnQhFANAIAshDEEAIRJBACEHA0AgB0ECaiEKAn8gB0EBdCAFaiICLgECIhNFBEBBACEIQQAhCUEAIQYgCiEHQQAMAQsgAi4BAEECdCARaiEJQQAhByATIQJBACENIAohBkEAIQ5BACEPA0AgBSAGQQF0ai4BACIIIAAgCUEBdCIQai8BAGwgB2ohByAAIBBBBnJqLwEAIAhsIA5qIQ4gACAQQQRyai8BACAIbCAPaiEPIAAgEEECcmovAQAgCGwgDWohDSAJQQRqIQkgBkEBaiEGIAJBAWsiAg0ACyAHQQd1IQggDUEHdSEJIA9BB3UhBiAKIBNqIQcgDkEHdQtBgEBrQQ51IgJB/wEgAkH/AUgbIgJBACACQQBKGyIKQf8BcQRAIAlB/wFsIAJtIQkgCEH/AWwgAm0hCCAGQf8BbCACbSEGCyABIAxBAnRqIAlBgEBrQQ51IgJB/wEgAkH/AUgbIgJBACACQQBKG0EIdEGA/gNxIAZBgEBrQQ51IgJB/wEgAkH/AUgbIgJBACACQQBKG0EQdEGAgPwHcSAKQRh0ciAIQYBAa0EOdSICQf8BIAJB/wFIGyICQQAgAkEAShtycjYCACADIAxqIQwgEkEBaiISIARHDQALIBQgC0EBaiILbCERIAMgC0cNAAsLC0AAIAcEQEEAIAIgAyAEIAUgABADIAJBACAEIAUgBiABEAQPC0EAIAIgAyAEIAUgABABIAJBACAEIAUgBiABEAIL";
    }, {}], 4: [function(_dereq_, module2, exports2) {
      module2.exports = {
        name: "resize",
        fn: _dereq_("./resize"),
        wasm_fn: _dereq_("./resize_wasm"),
        wasm_src: _dereq_("./convolve_wasm_base64")
      };
    }, {"./convolve_wasm_base64": 3, "./resize": 5, "./resize_wasm": 8}], 5: [function(_dereq_, module2, exports2) {
      var createFilters = _dereq_("./resize_filter_gen");
      var _require = _dereq_("./convolve"), convolveHor = _require.convolveHor, convolveVert = _require.convolveVert, convolveHorWithPre = _require.convolveHorWithPre, convolveVertWithPre = _require.convolveVertWithPre;
      function hasAlpha(src, width, height) {
        var ptr = 3, len2 = width * height * 4 | 0;
        while (ptr < len2) {
          if (src[ptr] !== 255)
            return true;
          ptr = ptr + 4 | 0;
        }
        return false;
      }
      function resetAlpha(dst, width, height) {
        var ptr = 3, len2 = width * height * 4 | 0;
        while (ptr < len2) {
          dst[ptr] = 255;
          ptr = ptr + 4 | 0;
        }
      }
      module2.exports = function resize(options) {
        var src = options.src;
        var srcW = options.width;
        var srcH = options.height;
        var destW = options.toWidth;
        var destH = options.toHeight;
        var scaleX = options.scaleX || options.toWidth / options.width;
        var scaleY = options.scaleY || options.toHeight / options.height;
        var offsetX = options.offsetX || 0;
        var offsetY = options.offsetY || 0;
        var dest = options.dest || new Uint8Array(destW * destH * 4);
        var filter2 = typeof options.filter === "undefined" ? "mks2013" : options.filter;
        var filtersX = createFilters(filter2, srcW, destW, scaleX, offsetX), filtersY = createFilters(filter2, srcH, destH, scaleY, offsetY);
        var tmp = new Uint16Array(destW * srcH * 4);
        if (hasAlpha(src, srcW, srcH)) {
          convolveHorWithPre(src, tmp, srcW, srcH, destW, filtersX);
          convolveVertWithPre(tmp, dest, srcH, destW, destH, filtersY);
        } else {
          convolveHor(src, tmp, srcW, srcH, destW, filtersX);
          convolveVert(tmp, dest, srcH, destW, destH, filtersY);
          resetAlpha(dest, destW, destH);
        }
        return dest;
      };
    }, {"./convolve": 2, "./resize_filter_gen": 6}], 6: [function(_dereq_, module2, exports2) {
      var FILTER_INFO = _dereq_("./resize_filter_info");
      var FIXED_FRAC_BITS = 14;
      function toFixedPoint(num) {
        return Math.round(num * ((1 << FIXED_FRAC_BITS) - 1));
      }
      module2.exports = function resizeFilterGen(filter2, srcSize, destSize, scale, offset) {
        var filterFunction = FILTER_INFO.filter[filter2].fn;
        var scaleInverted = 1 / scale;
        var scaleClamped = Math.min(1, scale);
        var srcWindow = FILTER_INFO.filter[filter2].win / scaleClamped;
        var destPixel, srcPixel, srcFirst, srcLast, filterElementSize, floatFilter, fxpFilter, total, pxl, idx, floatVal, filterTotal, filterVal;
        var leftNotEmpty, rightNotEmpty, filterShift, filterSize;
        var maxFilterElementSize = Math.floor((srcWindow + 1) * 2);
        var packedFilter = new Int16Array((maxFilterElementSize + 2) * destSize);
        var packedFilterPtr = 0;
        var slowCopy = !packedFilter.subarray || !packedFilter.set;
        for (destPixel = 0; destPixel < destSize; destPixel++) {
          srcPixel = (destPixel + 0.5) * scaleInverted + offset;
          srcFirst = Math.max(0, Math.floor(srcPixel - srcWindow));
          srcLast = Math.min(srcSize - 1, Math.ceil(srcPixel + srcWindow));
          filterElementSize = srcLast - srcFirst + 1;
          floatFilter = new Float32Array(filterElementSize);
          fxpFilter = new Int16Array(filterElementSize);
          total = 0;
          for (pxl = srcFirst, idx = 0; pxl <= srcLast; pxl++, idx++) {
            floatVal = filterFunction((pxl + 0.5 - srcPixel) * scaleClamped);
            total += floatVal;
            floatFilter[idx] = floatVal;
          }
          filterTotal = 0;
          for (idx = 0; idx < floatFilter.length; idx++) {
            filterVal = floatFilter[idx] / total;
            filterTotal += filterVal;
            fxpFilter[idx] = toFixedPoint(filterVal);
          }
          fxpFilter[destSize >> 1] += toFixedPoint(1 - filterTotal);
          leftNotEmpty = 0;
          while (leftNotEmpty < fxpFilter.length && fxpFilter[leftNotEmpty] === 0) {
            leftNotEmpty++;
          }
          if (leftNotEmpty < fxpFilter.length) {
            rightNotEmpty = fxpFilter.length - 1;
            while (rightNotEmpty > 0 && fxpFilter[rightNotEmpty] === 0) {
              rightNotEmpty--;
            }
            filterShift = srcFirst + leftNotEmpty;
            filterSize = rightNotEmpty - leftNotEmpty + 1;
            packedFilter[packedFilterPtr++] = filterShift;
            packedFilter[packedFilterPtr++] = filterSize;
            if (!slowCopy) {
              packedFilter.set(fxpFilter.subarray(leftNotEmpty, rightNotEmpty + 1), packedFilterPtr);
              packedFilterPtr += filterSize;
            } else {
              for (idx = leftNotEmpty; idx <= rightNotEmpty; idx++) {
                packedFilter[packedFilterPtr++] = fxpFilter[idx];
              }
            }
          } else {
            packedFilter[packedFilterPtr++] = 0;
            packedFilter[packedFilterPtr++] = 0;
          }
        }
        return packedFilter;
      };
    }, {"./resize_filter_info": 7}], 7: [function(_dereq_, module2, exports2) {
      var filter2 = {
        box: {
          win: 0.5,
          fn: function fn(x) {
            if (x < 0)
              x = -x;
            return x < 0.5 ? 1 : 0;
          }
        },
        hamming: {
          win: 1,
          fn: function fn(x) {
            if (x < 0)
              x = -x;
            if (x >= 1) {
              return 0;
            }
            if (x < 11920929e-14) {
              return 1;
            }
            var xpi = x * Math.PI;
            return Math.sin(xpi) / xpi * (0.54 + 0.46 * Math.cos(xpi / 1));
          }
        },
        lanczos2: {
          win: 2,
          fn: function fn(x) {
            if (x < 0)
              x = -x;
            if (x >= 2) {
              return 0;
            }
            if (x < 11920929e-14) {
              return 1;
            }
            var xpi = x * Math.PI;
            return Math.sin(xpi) / xpi * Math.sin(xpi / 2) / (xpi / 2);
          }
        },
        lanczos3: {
          win: 3,
          fn: function fn(x) {
            if (x < 0)
              x = -x;
            if (x >= 3) {
              return 0;
            }
            if (x < 11920929e-14) {
              return 1;
            }
            var xpi = x * Math.PI;
            return Math.sin(xpi) / xpi * Math.sin(xpi / 3) / (xpi / 3);
          }
        },
        mks2013: {
          win: 2.5,
          fn: function fn(x) {
            if (x < 0)
              x = -x;
            if (x >= 2.5) {
              return 0;
            }
            if (x >= 1.5) {
              return -0.125 * (x - 2.5) * (x - 2.5);
            }
            if (x >= 0.5) {
              return 0.25 * (4 * x * x - 11 * x + 7);
            }
            return 1.0625 - 1.75 * x * x;
          }
        }
      };
      module2.exports = {
        filter: filter2,
        f2q: {
          box: 0,
          hamming: 1,
          lanczos2: 2,
          lanczos3: 3
        },
        q2f: ["box", "hamming", "lanczos2", "lanczos3"]
      };
    }, {}], 8: [function(_dereq_, module2, exports2) {
      var createFilters = _dereq_("./resize_filter_gen");
      function hasAlpha(src, width, height) {
        var ptr = 3, len2 = width * height * 4 | 0;
        while (ptr < len2) {
          if (src[ptr] !== 255)
            return true;
          ptr = ptr + 4 | 0;
        }
        return false;
      }
      function resetAlpha(dst, width, height) {
        var ptr = 3, len2 = width * height * 4 | 0;
        while (ptr < len2) {
          dst[ptr] = 255;
          ptr = ptr + 4 | 0;
        }
      }
      function asUint8Array(src) {
        return new Uint8Array(src.buffer, 0, src.byteLength);
      }
      var IS_LE = true;
      try {
        IS_LE = new Uint32Array(new Uint8Array([1, 0, 0, 0]).buffer)[0] === 1;
      } catch (__) {
      }
      function copyInt16asLE(src, target, target_offset) {
        if (IS_LE) {
          target.set(asUint8Array(src), target_offset);
          return;
        }
        for (var ptr = target_offset, i = 0; i < src.length; i++) {
          var data = src[i];
          target[ptr++] = data & 255;
          target[ptr++] = data >> 8 & 255;
        }
      }
      module2.exports = function resize_wasm(options) {
        var src = options.src;
        var srcW = options.width;
        var srcH = options.height;
        var destW = options.toWidth;
        var destH = options.toHeight;
        var scaleX = options.scaleX || options.toWidth / options.width;
        var scaleY = options.scaleY || options.toHeight / options.height;
        var offsetX = options.offsetX || 0;
        var offsetY = options.offsetY || 0;
        var dest = options.dest || new Uint8Array(destW * destH * 4);
        var filter2 = typeof options.filter === "undefined" ? "mks2013" : options.filter;
        var filtersX = createFilters(filter2, srcW, destW, scaleX, offsetX), filtersY = createFilters(filter2, srcH, destH, scaleY, offsetY);
        var src_offset = 0;
        var src_size = Math.max(src.byteLength, dest.byteLength);
        var tmp_offset = this.__align(src_offset + src_size);
        var tmp_size = srcH * destW * 4 * 2;
        var filtersX_offset = this.__align(tmp_offset + tmp_size);
        var filtersY_offset = this.__align(filtersX_offset + filtersX.byteLength);
        var alloc_bytes = filtersY_offset + filtersY.byteLength;
        var instance = this.__instance("resize", alloc_bytes);
        var mem = new Uint8Array(this.__memory.buffer);
        var mem32 = new Uint32Array(this.__memory.buffer);
        var src32 = new Uint32Array(src.buffer);
        mem32.set(src32);
        copyInt16asLE(filtersX, mem, filtersX_offset);
        copyInt16asLE(filtersY, mem, filtersY_offset);
        var fn = instance.exports.convolveHV || instance.exports._convolveHV;
        if (hasAlpha(src, srcW, srcH)) {
          fn(filtersX_offset, filtersY_offset, tmp_offset, srcW, srcH, destW, destH, 1);
        } else {
          fn(filtersX_offset, filtersY_offset, tmp_offset, srcW, srcH, destW, destH, 0);
          resetAlpha(dest, destW, destH);
        }
        var dest32 = new Uint32Array(dest.buffer);
        dest32.set(new Uint32Array(this.__memory.buffer, 0, destH * destW));
        return dest;
      };
    }, {"./resize_filter_gen": 6}], 9: [function(_dereq_, module2, exports2) {
      module2.exports = {
        name: "unsharp_mask",
        fn: _dereq_("./unsharp_mask"),
        wasm_fn: _dereq_("./unsharp_mask_wasm"),
        wasm_src: _dereq_("./unsharp_mask_wasm_base64")
      };
    }, {"./unsharp_mask": 10, "./unsharp_mask_wasm": 11, "./unsharp_mask_wasm_base64": 12}], 10: [function(_dereq_, module2, exports2) {
      var glur_mono16 = _dereq_("glur/mono16");
      function hsv_v16(img, width, height) {
        var size = width * height;
        var out = new Uint16Array(size);
        var r, g, b, max2;
        for (var i = 0; i < size; i++) {
          r = img[4 * i];
          g = img[4 * i + 1];
          b = img[4 * i + 2];
          max2 = r >= g && r >= b ? r : g >= b && g >= r ? g : b;
          out[i] = max2 << 8;
        }
        return out;
      }
      module2.exports = function unsharp(img, width, height, amount, radius, threshold) {
        var v1, v2, vmul;
        var diff, iTimes4;
        if (amount === 0 || radius < 0.5) {
          return;
        }
        if (radius > 2) {
          radius = 2;
        }
        var brightness = hsv_v16(img, width, height);
        var blured = new Uint16Array(brightness);
        glur_mono16(blured, width, height, radius);
        var amountFp = amount / 100 * 4096 + 0.5 | 0;
        var thresholdFp = threshold << 8;
        var size = width * height;
        for (var i = 0; i < size; i++) {
          v1 = brightness[i];
          diff = v1 - blured[i];
          if (Math.abs(diff) >= thresholdFp) {
            v2 = v1 + (amountFp * diff + 2048 >> 12);
            v2 = v2 > 65280 ? 65280 : v2;
            v2 = v2 < 0 ? 0 : v2;
            v1 = v1 !== 0 ? v1 : 1;
            vmul = (v2 << 12) / v1 | 0;
            iTimes4 = i * 4;
            img[iTimes4] = img[iTimes4] * vmul + 2048 >> 12;
            img[iTimes4 + 1] = img[iTimes4 + 1] * vmul + 2048 >> 12;
            img[iTimes4 + 2] = img[iTimes4 + 2] * vmul + 2048 >> 12;
          }
        }
      };
    }, {"glur/mono16": 18}], 11: [function(_dereq_, module2, exports2) {
      module2.exports = function unsharp(img, width, height, amount, radius, threshold) {
        if (amount === 0 || radius < 0.5) {
          return;
        }
        if (radius > 2) {
          radius = 2;
        }
        var pixels = width * height;
        var img_bytes_cnt = pixels * 4;
        var hsv_bytes_cnt = pixels * 2;
        var blur_bytes_cnt = pixels * 2;
        var blur_line_byte_cnt = Math.max(width, height) * 4;
        var blur_coeffs_byte_cnt = 8 * 4;
        var img_offset = 0;
        var hsv_offset = img_bytes_cnt;
        var blur_offset = hsv_offset + hsv_bytes_cnt;
        var blur_tmp_offset = blur_offset + blur_bytes_cnt;
        var blur_line_offset = blur_tmp_offset + blur_bytes_cnt;
        var blur_coeffs_offset = blur_line_offset + blur_line_byte_cnt;
        var instance = this.__instance("unsharp_mask", img_bytes_cnt + hsv_bytes_cnt + blur_bytes_cnt * 2 + blur_line_byte_cnt + blur_coeffs_byte_cnt, {
          exp: Math.exp
        });
        var img32 = new Uint32Array(img.buffer);
        var mem32 = new Uint32Array(this.__memory.buffer);
        mem32.set(img32);
        var fn = instance.exports.hsv_v16 || instance.exports._hsv_v16;
        fn(img_offset, hsv_offset, width, height);
        fn = instance.exports.blurMono16 || instance.exports._blurMono16;
        fn(hsv_offset, blur_offset, blur_tmp_offset, blur_line_offset, blur_coeffs_offset, width, height, radius);
        fn = instance.exports.unsharp || instance.exports._unsharp;
        fn(img_offset, img_offset, hsv_offset, blur_offset, width, height, amount, threshold);
        img32.set(new Uint32Array(this.__memory.buffer, 0, pixels));
      };
    }, {}], 12: [function(_dereq_, module2, exports2) {
      module2.exports = "AGFzbQEAAAAADAZkeWxpbmsAAAAAAAE0B2AAAGAEf39/fwBgBn9/f39/fwBgCH9/f39/f39/AGAIf39/f39/f30AYAJ9fwBgAXwBfAIZAgNlbnYDZXhwAAYDZW52Bm1lbW9yeQIAAAMHBgAFAgQBAwYGAX8AQQALB4oBCBFfX3dhc21fY2FsbF9jdG9ycwABFl9fYnVpbGRfZ2F1c3NpYW5fY29lZnMAAg5fX2dhdXNzMTZfbGluZQADCmJsdXJNb25vMTYABAdoc3ZfdjE2AAUHdW5zaGFycAAGDF9fZHNvX2hhbmRsZQMAGF9fd2FzbV9hcHBseV9kYXRhX3JlbG9jcwABCsUMBgMAAQvWAQEHfCABRNuGukOCGvs/IAC7oyICRAAAAAAAAADAohAAIgW2jDgCFCABIAKaEAAiAyADoCIGtjgCECABRAAAAAAAAPA/IAOhIgQgBKIgAyACIAKgokQAAAAAAADwP6AgBaGjIgS2OAIAIAEgBSAEmqIiB7Y4AgwgASADIAJEAAAAAAAA8D+gIASioiIItjgCCCABIAMgAkQAAAAAAADwv6AgBKKiIgK2OAIEIAEgByAIoCAFRAAAAAAAAPA/IAahoCIDo7Y4AhwgASAEIAKgIAOjtjgCGAuGBQMGfwl8An0gAyoCDCEVIAMqAgghFiADKgIUuyERIAMqAhC7IRACQCAEQQFrIghBAEgiCQRAIAIhByAAIQYMAQsgAiAALwEAuCIPIAMqAhi7oiIMIBGiIg0gDCAQoiAPIAMqAgS7IhOiIhQgAyoCALsiEiAPoqCgoCIOtjgCACACQQRqIQcgAEECaiEGIAhFDQAgCEEBIAhBAUgbIgpBf3MhCwJ/IAQgCmtBAXFFBEAgDiENIAgMAQsgAiANIA4gEKIgFCASIAAvAQK4Ig+ioKCgIg22OAIEIAJBCGohByAAQQRqIQYgDiEMIARBAmsLIQIgC0EAIARrRg0AA0AgByAMIBGiIA0gEKIgDyAToiASIAYvAQC4Ig6ioKCgIgy2OAIAIAcgDSARoiAMIBCiIA4gE6IgEiAGLwECuCIPoqCgoCINtjgCBCAHQQhqIQcgBkEEaiEGIAJBAkohACACQQJrIQIgAA0ACwsCQCAJDQAgASAFIAhsQQF0aiIAAn8gBkECay8BACICuCINIBW7IhKiIA0gFrsiE6KgIA0gAyoCHLuiIgwgEKKgIAwgEaKgIg8gB0EEayIHKgIAu6AiDkQAAAAAAADwQWMgDkQAAAAAAAAAAGZxBEAgDqsMAQtBAAs7AQAgCEUNACAGQQRrIQZBACAFa0EBdCEBA0ACfyANIBKiIAJB//8DcbgiDSAToqAgDyIOIBCioCAMIBGioCIPIAdBBGsiByoCALugIgxEAAAAAAAA8EFjIAxEAAAAAAAAAABmcQRAIAyrDAELQQALIQMgBi8BACECIAAgAWoiACADOwEAIAZBAmshBiAIQQFKIQMgDiEMIAhBAWshCCADDQALCwvRAgIBfwd8AkAgB0MAAAAAWw0AIARE24a6Q4Ia+z8gB0MAAAA/l7ujIglEAAAAAAAAAMCiEAAiDLaMOAIUIAQgCZoQACIKIAqgIg22OAIQIAREAAAAAAAA8D8gCqEiCyALoiAKIAkgCaCiRAAAAAAAAPA/oCAMoaMiC7Y4AgAgBCAMIAuaoiIOtjgCDCAEIAogCUQAAAAAAADwP6AgC6KiIg+2OAIIIAQgCiAJRAAAAAAAAPC/oCALoqIiCbY4AgQgBCAOIA+gIAxEAAAAAAAA8D8gDaGgIgqjtjgCHCAEIAsgCaAgCqO2OAIYIAYEQANAIAAgBSAIbEEBdGogAiAIQQF0aiADIAQgBSAGEAMgCEEBaiIIIAZHDQALCyAFRQ0AQQAhCANAIAIgBiAIbEEBdGogASAIQQF0aiADIAQgBiAFEAMgCEEBaiIIIAVHDQALCwtxAQN/IAIgA2wiBQRAA0AgASAAKAIAIgRBEHZB/wFxIgIgAiAEQQh2Qf8BcSIDIAMgBEH/AXEiBEkbIAIgA0sbIgYgBiAEIAIgBEsbIAMgBEsbQQh0OwEAIAFBAmohASAAQQRqIQAgBUEBayIFDQALCwuZAgIDfwF8IAQgBWwhBAJ/IAazQwAAgEWUQwAAyEKVu0QAAAAAAADgP6AiC5lEAAAAAAAA4EFjBEAgC6oMAQtBgICAgHgLIQUgBARAIAdBCHQhCUEAIQYDQCAJIAIgBkEBdCIHai8BACIBIAMgB2ovAQBrIgcgB0EfdSIIaiAIc00EQCAAIAZBAnQiCGoiCiAFIAdsQYAQakEMdSABaiIHQYD+AyAHQYD+A0gbIgdBACAHQQBKG0EMdCABQQEgARtuIgEgCi0AAGxBgBBqQQx2OgAAIAAgCEEBcmoiByABIActAABsQYAQakEMdjoAACAAIAhBAnJqIgcgASAHLQAAbEGAEGpBDHY6AAALIAZBAWoiBiAERw0ACwsL";
    }, {}], 13: [function(_dereq_, module2, exports2) {
      var GC_INTERVAL = 100;
      function Pool(create2, idle) {
        this.create = create2;
        this.available = [];
        this.acquired = {};
        this.lastId = 1;
        this.timeoutId = 0;
        this.idle = idle || 2e3;
      }
      Pool.prototype.acquire = function() {
        var _this = this;
        var resource;
        if (this.available.length !== 0) {
          resource = this.available.pop();
        } else {
          resource = this.create();
          resource.id = this.lastId++;
          resource.release = function() {
            return _this.release(resource);
          };
        }
        this.acquired[resource.id] = resource;
        return resource;
      };
      Pool.prototype.release = function(resource) {
        var _this2 = this;
        delete this.acquired[resource.id];
        resource.lastUsed = Date.now();
        this.available.push(resource);
        if (this.timeoutId === 0) {
          this.timeoutId = setTimeout(function() {
            return _this2.gc();
          }, GC_INTERVAL);
        }
      };
      Pool.prototype.gc = function() {
        var _this3 = this;
        var now2 = Date.now();
        this.available = this.available.filter(function(resource) {
          if (now2 - resource.lastUsed > _this3.idle) {
            resource.destroy();
            return false;
          }
          return true;
        });
        if (this.available.length !== 0) {
          this.timeoutId = setTimeout(function() {
            return _this3.gc();
          }, GC_INTERVAL);
        } else {
          this.timeoutId = 0;
        }
      };
      module2.exports = Pool;
    }, {}], 14: [function(_dereq_, module2, exports2) {
      var MIN_INNER_TILE_SIZE = 2;
      module2.exports = function createStages(fromWidth, fromHeight, toWidth, toHeight, srcTileSize, destTileBorder) {
        var scaleX = toWidth / fromWidth;
        var scaleY = toHeight / fromHeight;
        var minScale = (2 * destTileBorder + MIN_INNER_TILE_SIZE + 1) / srcTileSize;
        if (minScale > 0.5)
          return [[toWidth, toHeight]];
        var stageCount = Math.ceil(Math.log(Math.min(scaleX, scaleY)) / Math.log(minScale));
        if (stageCount <= 1)
          return [[toWidth, toHeight]];
        var result = [];
        for (var i = 0; i < stageCount; i++) {
          var width = Math.round(Math.pow(Math.pow(fromWidth, stageCount - i - 1) * Math.pow(toWidth, i + 1), 1 / stageCount));
          var height = Math.round(Math.pow(Math.pow(fromHeight, stageCount - i - 1) * Math.pow(toHeight, i + 1), 1 / stageCount));
          result.push([width, height]);
        }
        return result;
      };
    }, {}], 15: [function(_dereq_, module2, exports2) {
      var PIXEL_EPSILON = 1e-5;
      function pixelFloor(x) {
        var nearest = Math.round(x);
        if (Math.abs(x - nearest) < PIXEL_EPSILON) {
          return nearest;
        }
        return Math.floor(x);
      }
      function pixelCeil(x) {
        var nearest = Math.round(x);
        if (Math.abs(x - nearest) < PIXEL_EPSILON) {
          return nearest;
        }
        return Math.ceil(x);
      }
      module2.exports = function createRegions(options) {
        var scaleX = options.toWidth / options.width;
        var scaleY = options.toHeight / options.height;
        var innerTileWidth = pixelFloor(options.srcTileSize * scaleX) - 2 * options.destTileBorder;
        var innerTileHeight = pixelFloor(options.srcTileSize * scaleY) - 2 * options.destTileBorder;
        if (innerTileWidth < 1 || innerTileHeight < 1) {
          throw new Error("Internal error in pica: target tile width/height is too small.");
        }
        var x, y;
        var innerX, innerY, toTileWidth, toTileHeight;
        var tiles = [];
        var tile;
        for (innerY = 0; innerY < options.toHeight; innerY += innerTileHeight) {
          for (innerX = 0; innerX < options.toWidth; innerX += innerTileWidth) {
            x = innerX - options.destTileBorder;
            if (x < 0) {
              x = 0;
            }
            toTileWidth = innerX + innerTileWidth + options.destTileBorder - x;
            if (x + toTileWidth >= options.toWidth) {
              toTileWidth = options.toWidth - x;
            }
            y = innerY - options.destTileBorder;
            if (y < 0) {
              y = 0;
            }
            toTileHeight = innerY + innerTileHeight + options.destTileBorder - y;
            if (y + toTileHeight >= options.toHeight) {
              toTileHeight = options.toHeight - y;
            }
            tile = {
              toX: x,
              toY: y,
              toWidth: toTileWidth,
              toHeight: toTileHeight,
              toInnerX: innerX,
              toInnerY: innerY,
              toInnerWidth: innerTileWidth,
              toInnerHeight: innerTileHeight,
              offsetX: x / scaleX - pixelFloor(x / scaleX),
              offsetY: y / scaleY - pixelFloor(y / scaleY),
              scaleX,
              scaleY,
              x: pixelFloor(x / scaleX),
              y: pixelFloor(y / scaleY),
              width: pixelCeil(toTileWidth / scaleX),
              height: pixelCeil(toTileHeight / scaleY)
            };
            tiles.push(tile);
          }
        }
        return tiles;
      };
    }, {}], 16: [function(_dereq_, module2, exports2) {
      function objClass(obj) {
        return Object.prototype.toString.call(obj);
      }
      module2.exports.isCanvas = function isCanvas(element) {
        var cname = objClass(element);
        return cname === "[object HTMLCanvasElement]" || cname === "[object OffscreenCanvas]" || cname === "[object Canvas]";
      };
      module2.exports.isImage = function isImage(element) {
        return objClass(element) === "[object HTMLImageElement]";
      };
      module2.exports.isImageBitmap = function isImageBitmap(element) {
        return objClass(element) === "[object ImageBitmap]";
      };
      module2.exports.limiter = function limiter(concurrency) {
        var active = 0, queue = [];
        function roll() {
          if (active < concurrency && queue.length) {
            active++;
            queue.shift()();
          }
        }
        return function limit(fn) {
          return new Promise(function(resolve, reject) {
            queue.push(function() {
              fn().then(function(result) {
                resolve(result);
                active--;
                roll();
              }, function(err) {
                reject(err);
                active--;
                roll();
              });
            });
            roll();
          });
        };
      };
      module2.exports.cib_quality_name = function cib_quality_name(num) {
        switch (num) {
          case 0:
            return "pixelated";
          case 1:
            return "low";
          case 2:
            return "medium";
        }
        return "high";
      };
      module2.exports.cib_support = function cib_support(createCanvas) {
        return Promise.resolve().then(function() {
          if (typeof createImageBitmap === "undefined") {
            return false;
          }
          var c = createCanvas(100, 100);
          return createImageBitmap(c, 0, 0, 100, 100, {
            resizeWidth: 10,
            resizeHeight: 10,
            resizeQuality: "high"
          }).then(function(bitmap) {
            var status = bitmap.width === 10;
            bitmap.close();
            c = null;
            return status;
          });
        })["catch"](function() {
          return false;
        });
      };
      module2.exports.worker_offscreen_canvas_support = function worker_offscreen_canvas_support() {
        return new Promise(function(resolve, reject) {
          if (typeof OffscreenCanvas === "undefined") {
            resolve(false);
            return;
          }
          function workerPayload(self2) {
            if (typeof createImageBitmap === "undefined") {
              self2.postMessage(false);
              return;
            }
            Promise.resolve().then(function() {
              var canvas = new OffscreenCanvas(10, 10);
              var ctx = canvas.getContext("2d");
              ctx.rect(0, 0, 1, 1);
              return createImageBitmap(canvas, 0, 0, 1, 1);
            }).then(function() {
              return self2.postMessage(true);
            }, function() {
              return self2.postMessage(false);
            });
          }
          var code = btoa("(".concat(workerPayload.toString(), ")(self);"));
          var w = new Worker("data:text/javascript;base64,".concat(code));
          w.onmessage = function(ev) {
            return resolve(ev.data);
          };
          w.onerror = reject;
        }).then(function(result) {
          return result;
        }, function() {
          return false;
        });
      };
      module2.exports.can_use_canvas = function can_use_canvas(createCanvas) {
        var usable = false;
        try {
          var canvas = createCanvas(2, 1);
          var ctx = canvas.getContext("2d");
          var d = ctx.createImageData(2, 1);
          d.data[0] = 12;
          d.data[1] = 23;
          d.data[2] = 34;
          d.data[3] = 255;
          d.data[4] = 45;
          d.data[5] = 56;
          d.data[6] = 67;
          d.data[7] = 255;
          ctx.putImageData(d, 0, 0);
          d = null;
          d = ctx.getImageData(0, 0, 2, 1);
          if (d.data[0] === 12 && d.data[1] === 23 && d.data[2] === 34 && d.data[3] === 255 && d.data[4] === 45 && d.data[5] === 56 && d.data[6] === 67 && d.data[7] === 255) {
            usable = true;
          }
        } catch (err) {
        }
        return usable;
      };
      module2.exports.cib_can_use_region = function cib_can_use_region() {
        return new Promise(function(resolve) {
          if (typeof Image === "undefined" || typeof createImageBitmap === "undefined") {
            resolve(false);
            return;
          }
          var image = new Image();
          image.src = "data:image/jpeg;base64,/9j/4QBiRXhpZgAATU0AKgAAAAgABQESAAMAAAABAAYAAAEaAAUAAAABAAAASgEbAAUAAAABAAAAUgEoAAMAAAABAAIAAAITAAMAAAABAAEAAAAAAAAAAABIAAAAAQAAAEgAAAAB/9sAQwAEAwMEAwMEBAMEBQQEBQYKBwYGBgYNCQoICg8NEBAPDQ8OERMYFBESFxIODxUcFRcZGRsbGxAUHR8dGh8YGhsa/9sAQwEEBQUGBQYMBwcMGhEPERoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoa/8IAEQgAAQACAwERAAIRAQMRAf/EABQAAQAAAAAAAAAAAAAAAAAAAAf/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF/P//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQH//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Qf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Qf//Z";
          image.onload = function() {
            createImageBitmap(image, 0, 0, image.width, image.height).then(function(bitmap) {
              if (bitmap.width === image.width && bitmap.height === image.height) {
                resolve(true);
              } else {
                resolve(false);
              }
            }, function() {
              return resolve(false);
            });
          };
          image.onerror = function() {
            return resolve(false);
          };
        });
      };
    }, {}], 17: [function(_dereq_, module2, exports2) {
      module2.exports = function() {
        var MathLib = _dereq_("./mathlib");
        var mathLib;
        onmessage = function onmessage2(ev) {
          var tileOpts = ev.data.opts;
          if (!tileOpts.src && tileOpts.srcBitmap) {
            var canvas = new OffscreenCanvas(tileOpts.width, tileOpts.height);
            var ctx = canvas.getContext("2d");
            ctx.drawImage(tileOpts.srcBitmap, 0, 0);
            tileOpts.src = ctx.getImageData(0, 0, tileOpts.width, tileOpts.height).data;
            canvas.width = canvas.height = 0;
            canvas = null;
            tileOpts.srcBitmap.close();
            tileOpts.srcBitmap = null;
          }
          if (!mathLib)
            mathLib = new MathLib(ev.data.features);
          var data = mathLib.resizeAndUnsharp(tileOpts);
          {
            postMessage({
              data
            }, [data.buffer]);
          }
        };
      };
    }, {"./mathlib": 1}], 18: [function(_dereq_, module2, exports2) {
      var a0, a1, a2, a3, b1, b2, left_corner, right_corner;
      function gaussCoef(sigma) {
        if (sigma < 0.5) {
          sigma = 0.5;
        }
        var a = Math.exp(0.726 * 0.726) / sigma, g1 = Math.exp(-a), g2 = Math.exp(-2 * a), k = (1 - g1) * (1 - g1) / (1 + 2 * a * g1 - g2);
        a0 = k;
        a1 = k * (a - 1) * g1;
        a2 = k * (a + 1) * g1;
        a3 = -k * g2;
        b1 = 2 * g1;
        b2 = -g2;
        left_corner = (a0 + a1) / (1 - b1 - b2);
        right_corner = (a2 + a3) / (1 - b1 - b2);
        return new Float32Array([a0, a1, a2, a3, b1, b2, left_corner, right_corner]);
      }
      function convolveMono16(src, out, line, coeff, width, height) {
        var prev_src, curr_src, curr_out, prev_out, prev_prev_out;
        var src_index, out_index, line_index;
        var i, j;
        var coeff_a0, coeff_a1, coeff_b1, coeff_b2;
        for (i = 0; i < height; i++) {
          src_index = i * width;
          out_index = i;
          line_index = 0;
          prev_src = src[src_index];
          prev_prev_out = prev_src * coeff[6];
          prev_out = prev_prev_out;
          coeff_a0 = coeff[0];
          coeff_a1 = coeff[1];
          coeff_b1 = coeff[4];
          coeff_b2 = coeff[5];
          for (j = 0; j < width; j++) {
            curr_src = src[src_index];
            curr_out = curr_src * coeff_a0 + prev_src * coeff_a1 + prev_out * coeff_b1 + prev_prev_out * coeff_b2;
            prev_prev_out = prev_out;
            prev_out = curr_out;
            prev_src = curr_src;
            line[line_index] = prev_out;
            line_index++;
            src_index++;
          }
          src_index--;
          line_index--;
          out_index += height * (width - 1);
          prev_src = src[src_index];
          prev_prev_out = prev_src * coeff[7];
          prev_out = prev_prev_out;
          curr_src = prev_src;
          coeff_a0 = coeff[2];
          coeff_a1 = coeff[3];
          for (j = width - 1; j >= 0; j--) {
            curr_out = curr_src * coeff_a0 + prev_src * coeff_a1 + prev_out * coeff_b1 + prev_prev_out * coeff_b2;
            prev_prev_out = prev_out;
            prev_out = curr_out;
            prev_src = curr_src;
            curr_src = src[src_index];
            out[out_index] = line[line_index] + prev_out;
            src_index--;
            line_index--;
            out_index -= height;
          }
        }
      }
      function blurMono16(src, width, height, radius) {
        if (!radius) {
          return;
        }
        var out = new Uint16Array(src.length), tmp_line = new Float32Array(Math.max(width, height));
        var coeff = gaussCoef(radius);
        convolveMono16(src, out, tmp_line, coeff, width, height);
        convolveMono16(out, src, tmp_line, coeff, height, width);
      }
      module2.exports = blurMono16;
    }, {}], 19: [function(_dereq_, module2, exports2) {
      var assign = _dereq_("object-assign");
      var base64decode = _dereq_("./lib/base64decode");
      var hasWebAssembly = _dereq_("./lib/wa_detect");
      var DEFAULT_OPTIONS = {
        js: true,
        wasm: true
      };
      function MultiMath(options) {
        if (!(this instanceof MultiMath))
          return new MultiMath(options);
        var opts = assign({}, DEFAULT_OPTIONS, options || {});
        this.options = opts;
        this.__cache = {};
        this.__init_promise = null;
        this.__modules = opts.modules || {};
        this.__memory = null;
        this.__wasm = {};
        this.__isLE = new Uint32Array(new Uint8Array([1, 0, 0, 0]).buffer)[0] === 1;
        if (!this.options.js && !this.options.wasm) {
          throw new Error('mathlib: at least "js" or "wasm" should be enabled');
        }
      }
      MultiMath.prototype.has_wasm = hasWebAssembly;
      MultiMath.prototype.use = function(module3) {
        this.__modules[module3.name] = module3;
        if (this.options.wasm && this.has_wasm() && module3.wasm_fn) {
          this[module3.name] = module3.wasm_fn;
        } else {
          this[module3.name] = module3.fn;
        }
        return this;
      };
      MultiMath.prototype.init = function() {
        if (this.__init_promise)
          return this.__init_promise;
        if (!this.options.js && this.options.wasm && !this.has_wasm()) {
          return Promise.reject(new Error(`mathlib: only "wasm" was enabled, but it's not supported`));
        }
        var self2 = this;
        this.__init_promise = Promise.all(Object.keys(self2.__modules).map(function(name) {
          var module3 = self2.__modules[name];
          if (!self2.options.wasm || !self2.has_wasm() || !module3.wasm_fn)
            return null;
          if (self2.__wasm[name])
            return null;
          return WebAssembly.compile(self2.__base64decode(module3.wasm_src)).then(function(m) {
            self2.__wasm[name] = m;
          });
        })).then(function() {
          return self2;
        });
        return this.__init_promise;
      };
      MultiMath.prototype.__base64decode = base64decode;
      MultiMath.prototype.__reallocate = function mem_grow_to(bytes) {
        if (!this.__memory) {
          this.__memory = new WebAssembly.Memory({
            initial: Math.ceil(bytes / (64 * 1024))
          });
          return this.__memory;
        }
        var mem_size = this.__memory.buffer.byteLength;
        if (mem_size < bytes) {
          this.__memory.grow(Math.ceil((bytes - mem_size) / (64 * 1024)));
        }
        return this.__memory;
      };
      MultiMath.prototype.__instance = function instance(name, memsize, env_extra) {
        if (memsize)
          this.__reallocate(memsize);
        if (!this.__wasm[name]) {
          var module3 = this.__modules[name];
          this.__wasm[name] = new WebAssembly.Module(this.__base64decode(module3.wasm_src));
        }
        if (!this.__cache[name]) {
          var env_base = {
            memoryBase: 0,
            memory: this.__memory,
            tableBase: 0,
            table: new WebAssembly.Table({initial: 0, element: "anyfunc"})
          };
          this.__cache[name] = new WebAssembly.Instance(this.__wasm[name], {
            env: assign(env_base, env_extra || {})
          });
        }
        return this.__cache[name];
      };
      MultiMath.prototype.__align = function align(number, base) {
        base = base || 8;
        var reminder = number % base;
        return number + (reminder ? base - reminder : 0);
      };
      module2.exports = MultiMath;
    }, {"./lib/base64decode": 20, "./lib/wa_detect": 21, "object-assign": 22}], 20: [function(_dereq_, module2, exports2) {
      var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
      module2.exports = function base64decode(str) {
        var input = str.replace(/[\r\n=]/g, ""), max2 = input.length;
        var out = new Uint8Array(max2 * 3 >> 2);
        var bits = 0;
        var ptr = 0;
        for (var idx = 0; idx < max2; idx++) {
          if (idx % 4 === 0 && idx) {
            out[ptr++] = bits >> 16 & 255;
            out[ptr++] = bits >> 8 & 255;
            out[ptr++] = bits & 255;
          }
          bits = bits << 6 | BASE64_MAP.indexOf(input.charAt(idx));
        }
        var tailbits = max2 % 4 * 6;
        if (tailbits === 0) {
          out[ptr++] = bits >> 16 & 255;
          out[ptr++] = bits >> 8 & 255;
          out[ptr++] = bits & 255;
        } else if (tailbits === 18) {
          out[ptr++] = bits >> 10 & 255;
          out[ptr++] = bits >> 2 & 255;
        } else if (tailbits === 12) {
          out[ptr++] = bits >> 4 & 255;
        }
        return out;
      };
    }, {}], 21: [function(_dereq_, module2, exports2) {
      var wa;
      module2.exports = function hasWebAssembly() {
        if (typeof wa !== "undefined")
          return wa;
        wa = false;
        if (typeof WebAssembly === "undefined")
          return wa;
        try {
          var bin = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 6, 1, 96, 1, 127, 1, 127, 3, 2, 1, 0, 5, 3, 1, 0, 1, 7, 8, 1, 4, 116, 101, 115, 116, 0, 0, 10, 16, 1, 14, 0, 32, 0, 65, 1, 54, 2, 0, 32, 0, 40, 2, 0, 11]);
          var module3 = new WebAssembly.Module(bin);
          var instance = new WebAssembly.Instance(module3, {});
          if (instance.exports.test(4) !== 0)
            wa = true;
          return wa;
        } catch (__) {
        }
        return wa;
      };
    }, {}], 22: [function(_dereq_, module2, exports2) {
      var getOwnPropertySymbols = Object.getOwnPropertySymbols;
      var hasOwnProperty = Object.prototype.hasOwnProperty;
      var propIsEnumerable = Object.prototype.propertyIsEnumerable;
      function toObject(val) {
        if (val === null || val === void 0) {
          throw new TypeError("Object.assign cannot be called with null or undefined");
        }
        return Object(val);
      }
      function shouldUseNative() {
        try {
          if (!Object.assign) {
            return false;
          }
          var test1 = new String("abc");
          test1[5] = "de";
          if (Object.getOwnPropertyNames(test1)[0] === "5") {
            return false;
          }
          var test2 = {};
          for (var i = 0; i < 10; i++) {
            test2["_" + String.fromCharCode(i)] = i;
          }
          var order2 = Object.getOwnPropertyNames(test2).map(function(n) {
            return test2[n];
          });
          if (order2.join("") !== "0123456789") {
            return false;
          }
          var test3 = {};
          "abcdefghijklmnopqrst".split("").forEach(function(letter) {
            test3[letter] = letter;
          });
          if (Object.keys(Object.assign({}, test3)).join("") !== "abcdefghijklmnopqrst") {
            return false;
          }
          return true;
        } catch (err) {
          return false;
        }
      }
      module2.exports = shouldUseNative() ? Object.assign : function(target, source) {
        var from;
        var to = toObject(target);
        var symbols;
        for (var s = 1; s < arguments.length; s++) {
          from = Object(arguments[s]);
          for (var key in from) {
            if (hasOwnProperty.call(from, key)) {
              to[key] = from[key];
            }
          }
          if (getOwnPropertySymbols) {
            symbols = getOwnPropertySymbols(from);
            for (var i = 0; i < symbols.length; i++) {
              if (propIsEnumerable.call(from, symbols[i])) {
                to[symbols[i]] = from[symbols[i]];
              }
            }
          }
        }
        return to;
      };
    }, {}], 23: [function(_dereq_, module2, exports2) {
      var bundleFn = arguments[3];
      var sources = arguments[4];
      var cache = arguments[5];
      var stringify = JSON.stringify;
      module2.exports = function(fn, options) {
        var wkey;
        var cacheKeys = Object.keys(cache);
        for (var i = 0, l = cacheKeys.length; i < l; i++) {
          var key = cacheKeys[i];
          var exp = cache[key].exports;
          if (exp === fn || exp && exp.default === fn) {
            wkey = key;
            break;
          }
        }
        if (!wkey) {
          wkey = Math.floor(Math.pow(16, 8) * Math.random()).toString(16);
          var wcache = {};
          for (var i = 0, l = cacheKeys.length; i < l; i++) {
            var key = cacheKeys[i];
            wcache[key] = key;
          }
          sources[wkey] = [
            "function(require,module,exports){" + fn + "(self); }",
            wcache
          ];
        }
        var skey = Math.floor(Math.pow(16, 8) * Math.random()).toString(16);
        var scache = {};
        scache[wkey] = wkey;
        sources[skey] = [
          "function(require,module,exports){var f = require(" + stringify(wkey) + ");(f.default ? f.default : f)(self);}",
          scache
        ];
        var workerSources = {};
        resolveSources(skey);
        function resolveSources(key2) {
          workerSources[key2] = true;
          for (var depPath in sources[key2][1]) {
            var depKey = sources[key2][1][depPath];
            if (!workerSources[depKey]) {
              resolveSources(depKey);
            }
          }
        }
        var src = "(" + bundleFn + ")({" + Object.keys(workerSources).map(function(key2) {
          return stringify(key2) + ":[" + sources[key2][0] + "," + stringify(sources[key2][1]) + "]";
        }).join(",") + "},{},[" + stringify(skey) + "])";
        var URL2 = window.URL || window.webkitURL || window.mozURL || window.msURL;
        var blob = new Blob([src], {type: "text/javascript"});
        if (options && options.bare) {
          return blob;
        }
        var workerUrl = URL2.createObjectURL(blob);
        var worker = new Worker(workerUrl);
        worker.objectURL = workerUrl;
        return worker;
      };
    }, {}], "/index.js": [function(_dereq_, module2, exports2) {
      function _slicedToArray(arr, i) {
        return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest();
      }
      function _nonIterableRest() {
        throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
      }
      function _unsupportedIterableToArray(o, minLen) {
        if (!o)
          return;
        if (typeof o === "string")
          return _arrayLikeToArray(o, minLen);
        var n = Object.prototype.toString.call(o).slice(8, -1);
        if (n === "Object" && o.constructor)
          n = o.constructor.name;
        if (n === "Map" || n === "Set")
          return Array.from(o);
        if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))
          return _arrayLikeToArray(o, minLen);
      }
      function _arrayLikeToArray(arr, len2) {
        if (len2 == null || len2 > arr.length)
          len2 = arr.length;
        for (var i = 0, arr2 = new Array(len2); i < len2; i++) {
          arr2[i] = arr[i];
        }
        return arr2;
      }
      function _iterableToArrayLimit(arr, i) {
        var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"];
        if (_i == null)
          return;
        var _arr = [];
        var _n = true;
        var _d = false;
        var _s, _e;
        try {
          for (_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true) {
            _arr.push(_s.value);
            if (i && _arr.length === i)
              break;
          }
        } catch (err) {
          _d = true;
          _e = err;
        } finally {
          try {
            if (!_n && _i["return"] != null)
              _i["return"]();
          } finally {
            if (_d)
              throw _e;
          }
        }
        return _arr;
      }
      function _arrayWithHoles(arr) {
        if (Array.isArray(arr))
          return arr;
      }
      var assign = _dereq_("object-assign");
      var webworkify = _dereq_("webworkify");
      var MathLib = _dereq_("./lib/mathlib");
      var Pool = _dereq_("./lib/pool");
      var utils = _dereq_("./lib/utils");
      var worker = _dereq_("./lib/worker");
      var createStages = _dereq_("./lib/stepper");
      var createRegions = _dereq_("./lib/tiler");
      var filter_info = _dereq_("./lib/mm_resize/resize_filter_info");
      var singletones = {};
      var NEED_SAFARI_FIX = false;
      try {
        if (typeof navigator !== "undefined" && navigator.userAgent) {
          NEED_SAFARI_FIX = navigator.userAgent.indexOf("Safari") >= 0;
        }
      } catch (e) {
      }
      var concurrency = 1;
      if (typeof navigator !== "undefined") {
        concurrency = Math.min(navigator.hardwareConcurrency || 1, 4);
      }
      var DEFAULT_PICA_OPTS = {
        tile: 1024,
        concurrency,
        features: ["js", "wasm", "ww"],
        idle: 2e3,
        createCanvas: function createCanvas(width, height) {
          var tmpCanvas = document.createElement("canvas");
          tmpCanvas.width = width;
          tmpCanvas.height = height;
          return tmpCanvas;
        }
      };
      var DEFAULT_RESIZE_OPTS = {
        filter: "mks2013",
        unsharpAmount: 0,
        unsharpRadius: 0,
        unsharpThreshold: 0
      };
      var CAN_NEW_IMAGE_DATA = false;
      var CAN_CREATE_IMAGE_BITMAP = false;
      var CAN_USE_CANVAS_GET_IMAGE_DATA = false;
      var CAN_USE_OFFSCREEN_CANVAS = false;
      var CAN_USE_CIB_REGION_FOR_IMAGE = false;
      function workerFabric() {
        return {
          value: webworkify(worker),
          destroy: function destroy() {
            this.value.terminate();
            if (typeof window !== "undefined") {
              var url = window.URL || window.webkitURL || window.mozURL || window.msURL;
              if (url && url.revokeObjectURL && this.value.objectURL) {
                url.revokeObjectURL(this.value.objectURL);
              }
            }
          }
        };
      }
      function Pica(options) {
        if (!(this instanceof Pica))
          return new Pica(options);
        this.options = assign({}, DEFAULT_PICA_OPTS, options || {});
        var limiter_key = "lk_".concat(this.options.concurrency);
        this.__limit = singletones[limiter_key] || utils.limiter(this.options.concurrency);
        if (!singletones[limiter_key])
          singletones[limiter_key] = this.__limit;
        this.features = {
          js: false,
          wasm: false,
          cib: false,
          ww: false
        };
        this.__workersPool = null;
        this.__requested_features = [];
        this.__mathlib = null;
      }
      Pica.prototype.init = function() {
        var _this = this;
        if (this.__initPromise)
          return this.__initPromise;
        if (typeof ImageData !== "undefined" && typeof Uint8ClampedArray !== "undefined") {
          try {
            new ImageData(new Uint8ClampedArray(400), 10, 10);
            CAN_NEW_IMAGE_DATA = true;
          } catch (__) {
          }
        }
        if (typeof ImageBitmap !== "undefined") {
          if (ImageBitmap.prototype && ImageBitmap.prototype.close) {
            CAN_CREATE_IMAGE_BITMAP = true;
          } else {
            this.debug("ImageBitmap does not support .close(), disabled");
          }
        }
        var features = this.options.features.slice();
        if (features.indexOf("all") >= 0) {
          features = ["cib", "wasm", "js", "ww"];
        }
        this.__requested_features = features;
        this.__mathlib = new MathLib(features);
        if (features.indexOf("ww") >= 0) {
          if (typeof window !== "undefined" && "Worker" in window) {
            try {
              var wkr = _dereq_("webworkify")(function() {
              });
              wkr.terminate();
              this.features.ww = true;
              var wpool_key = "wp_".concat(JSON.stringify(this.options));
              if (singletones[wpool_key]) {
                this.__workersPool = singletones[wpool_key];
              } else {
                this.__workersPool = new Pool(workerFabric, this.options.idle);
                singletones[wpool_key] = this.__workersPool;
              }
            } catch (__) {
            }
          }
        }
        var initMath = this.__mathlib.init().then(function(mathlib) {
          assign(_this.features, mathlib.features);
        });
        var checkCibResize;
        if (!CAN_CREATE_IMAGE_BITMAP) {
          checkCibResize = Promise.resolve(false);
        } else {
          checkCibResize = utils.cib_support(this.options.createCanvas).then(function(status) {
            if (_this.features.cib && features.indexOf("cib") < 0) {
              _this.debug("createImageBitmap() resize supported, but disabled by config");
              return;
            }
            if (features.indexOf("cib") >= 0)
              _this.features.cib = status;
          });
        }
        CAN_USE_CANVAS_GET_IMAGE_DATA = utils.can_use_canvas(this.options.createCanvas);
        var checkOffscreenCanvas;
        if (CAN_CREATE_IMAGE_BITMAP && CAN_NEW_IMAGE_DATA && features.indexOf("ww") !== -1) {
          checkOffscreenCanvas = utils.worker_offscreen_canvas_support();
        } else {
          checkOffscreenCanvas = Promise.resolve(false);
        }
        checkOffscreenCanvas = checkOffscreenCanvas.then(function(result) {
          CAN_USE_OFFSCREEN_CANVAS = result;
        });
        var checkCibRegion = utils.cib_can_use_region().then(function(result) {
          CAN_USE_CIB_REGION_FOR_IMAGE = result;
        });
        this.__initPromise = Promise.all([initMath, checkCibResize, checkOffscreenCanvas, checkCibRegion]).then(function() {
          return _this;
        });
        return this.__initPromise;
      };
      Pica.prototype.__invokeResize = function(tileOpts, opts) {
        var _this2 = this;
        opts.__mathCache = opts.__mathCache || {};
        return Promise.resolve().then(function() {
          if (!_this2.features.ww) {
            return {
              data: _this2.__mathlib.resizeAndUnsharp(tileOpts, opts.__mathCache)
            };
          }
          return new Promise(function(resolve, reject) {
            var w = _this2.__workersPool.acquire();
            if (opts.cancelToken)
              opts.cancelToken["catch"](function(err) {
                return reject(err);
              });
            w.value.onmessage = function(ev) {
              w.release();
              if (ev.data.err)
                reject(ev.data.err);
              else
                resolve(ev.data);
            };
            var transfer = [];
            if (tileOpts.src)
              transfer.push(tileOpts.src.buffer);
            if (tileOpts.srcBitmap)
              transfer.push(tileOpts.srcBitmap);
            w.value.postMessage({
              opts: tileOpts,
              features: _this2.__requested_features,
              preload: {
                wasm_nodule: _this2.__mathlib.__
              }
            }, transfer);
          });
        });
      };
      Pica.prototype.__extractTileData = function(tile, from, opts, stageEnv, extractTo) {
        if (this.features.ww && CAN_USE_OFFSCREEN_CANVAS && (utils.isCanvas(from) || CAN_USE_CIB_REGION_FOR_IMAGE)) {
          this.debug("Create tile for OffscreenCanvas");
          return createImageBitmap(stageEnv.srcImageBitmap || from, tile.x, tile.y, tile.width, tile.height).then(function(bitmap) {
            extractTo.srcBitmap = bitmap;
            return extractTo;
          });
        }
        if (utils.isCanvas(from)) {
          if (!stageEnv.srcCtx)
            stageEnv.srcCtx = from.getContext("2d");
          this.debug("Get tile pixel data");
          extractTo.src = stageEnv.srcCtx.getImageData(tile.x, tile.y, tile.width, tile.height).data;
          return extractTo;
        }
        this.debug("Draw tile imageBitmap/image to temporary canvas");
        var tmpCanvas = this.options.createCanvas(tile.width, tile.height);
        var tmpCtx = tmpCanvas.getContext("2d");
        tmpCtx.globalCompositeOperation = "copy";
        tmpCtx.drawImage(stageEnv.srcImageBitmap || from, tile.x, tile.y, tile.width, tile.height, 0, 0, tile.width, tile.height);
        this.debug("Get tile pixel data");
        extractTo.src = tmpCtx.getImageData(0, 0, tile.width, tile.height).data;
        tmpCanvas.width = tmpCanvas.height = 0;
        return extractTo;
      };
      Pica.prototype.__landTileData = function(tile, result, stageEnv) {
        var toImageData;
        this.debug("Convert raw rgba tile result to ImageData");
        if (result.bitmap) {
          stageEnv.toCtx.drawImage(result.bitmap, tile.toX, tile.toY);
          return null;
        }
        if (CAN_NEW_IMAGE_DATA) {
          toImageData = new ImageData(new Uint8ClampedArray(result.data), tile.toWidth, tile.toHeight);
        } else {
          toImageData = stageEnv.toCtx.createImageData(tile.toWidth, tile.toHeight);
          if (toImageData.data.set) {
            toImageData.data.set(result.data);
          } else {
            for (var i = toImageData.data.length - 1; i >= 0; i--) {
              toImageData.data[i] = result.data[i];
            }
          }
        }
        this.debug("Draw tile");
        if (NEED_SAFARI_FIX) {
          stageEnv.toCtx.putImageData(toImageData, tile.toX, tile.toY, tile.toInnerX - tile.toX, tile.toInnerY - tile.toY, tile.toInnerWidth + 1e-5, tile.toInnerHeight + 1e-5);
        } else {
          stageEnv.toCtx.putImageData(toImageData, tile.toX, tile.toY, tile.toInnerX - tile.toX, tile.toInnerY - tile.toY, tile.toInnerWidth, tile.toInnerHeight);
        }
        return null;
      };
      Pica.prototype.__tileAndResize = function(from, to, opts) {
        var _this3 = this;
        var stageEnv = {
          srcCtx: null,
          srcImageBitmap: null,
          isImageBitmapReused: false,
          toCtx: null
        };
        var processTile = function processTile2(tile) {
          return _this3.__limit(function() {
            if (opts.canceled)
              return opts.cancelToken;
            var tileOpts = {
              width: tile.width,
              height: tile.height,
              toWidth: tile.toWidth,
              toHeight: tile.toHeight,
              scaleX: tile.scaleX,
              scaleY: tile.scaleY,
              offsetX: tile.offsetX,
              offsetY: tile.offsetY,
              filter: opts.filter,
              unsharpAmount: opts.unsharpAmount,
              unsharpRadius: opts.unsharpRadius,
              unsharpThreshold: opts.unsharpThreshold
            };
            _this3.debug("Invoke resize math");
            return Promise.resolve(tileOpts).then(function(tileOpts2) {
              return _this3.__extractTileData(tile, from, opts, stageEnv, tileOpts2);
            }).then(function(tileOpts2) {
              _this3.debug("Invoke resize math");
              return _this3.__invokeResize(tileOpts2, opts);
            }).then(function(result) {
              if (opts.canceled)
                return opts.cancelToken;
              stageEnv.srcImageData = null;
              return _this3.__landTileData(tile, result, stageEnv);
            });
          });
        };
        return Promise.resolve().then(function() {
          stageEnv.toCtx = to.getContext("2d");
          if (utils.isCanvas(from))
            return null;
          if (utils.isImageBitmap(from)) {
            stageEnv.srcImageBitmap = from;
            stageEnv.isImageBitmapReused = true;
            return null;
          }
          if (utils.isImage(from)) {
            if (!CAN_CREATE_IMAGE_BITMAP)
              return null;
            _this3.debug("Decode image via createImageBitmap");
            return createImageBitmap(from).then(function(imageBitmap) {
              stageEnv.srcImageBitmap = imageBitmap;
            })["catch"](function(e) {
              return null;
            });
          }
          throw new Error('Pica: ".from" should be Image, Canvas or ImageBitmap');
        }).then(function() {
          if (opts.canceled)
            return opts.cancelToken;
          _this3.debug("Calculate tiles");
          var regions = createRegions({
            width: opts.width,
            height: opts.height,
            srcTileSize: _this3.options.tile,
            toWidth: opts.toWidth,
            toHeight: opts.toHeight,
            destTileBorder: opts.__destTileBorder
          });
          var jobs = regions.map(function(tile) {
            return processTile(tile);
          });
          function cleanup(stageEnv2) {
            if (stageEnv2.srcImageBitmap) {
              if (!stageEnv2.isImageBitmapReused)
                stageEnv2.srcImageBitmap.close();
              stageEnv2.srcImageBitmap = null;
            }
          }
          _this3.debug("Process tiles");
          return Promise.all(jobs).then(function() {
            _this3.debug("Finished!");
            cleanup(stageEnv);
            return to;
          }, function(err) {
            cleanup(stageEnv);
            throw err;
          });
        });
      };
      Pica.prototype.__processStages = function(stages, from, to, opts) {
        var _this4 = this;
        if (opts.canceled)
          return opts.cancelToken;
        var _stages$shift = stages.shift(), _stages$shift2 = _slicedToArray(_stages$shift, 2), toWidth = _stages$shift2[0], toHeight = _stages$shift2[1];
        var isLastStage = stages.length === 0;
        var filter2;
        if (isLastStage || filter_info.q2f.indexOf(opts.filter) < 0)
          filter2 = opts.filter;
        else if (opts.filter === "box")
          filter2 = "box";
        else
          filter2 = "hamming";
        opts = assign({}, opts, {
          toWidth,
          toHeight,
          filter: filter2
        });
        var tmpCanvas;
        if (!isLastStage) {
          tmpCanvas = this.options.createCanvas(toWidth, toHeight);
        }
        return this.__tileAndResize(from, isLastStage ? to : tmpCanvas, opts).then(function() {
          if (isLastStage)
            return to;
          opts.width = toWidth;
          opts.height = toHeight;
          return _this4.__processStages(stages, tmpCanvas, to, opts);
        }).then(function(res) {
          if (tmpCanvas) {
            tmpCanvas.width = tmpCanvas.height = 0;
          }
          return res;
        });
      };
      Pica.prototype.__resizeViaCreateImageBitmap = function(from, to, opts) {
        var _this5 = this;
        var toCtx = to.getContext("2d");
        this.debug("Resize via createImageBitmap()");
        return createImageBitmap(from, {
          resizeWidth: opts.toWidth,
          resizeHeight: opts.toHeight,
          resizeQuality: utils.cib_quality_name(filter_info.f2q[opts.filter])
        }).then(function(imageBitmap) {
          if (opts.canceled)
            return opts.cancelToken;
          if (!opts.unsharpAmount) {
            toCtx.drawImage(imageBitmap, 0, 0);
            imageBitmap.close();
            toCtx = null;
            _this5.debug("Finished!");
            return to;
          }
          _this5.debug("Unsharp result");
          var tmpCanvas = _this5.options.createCanvas(opts.toWidth, opts.toHeight);
          var tmpCtx = tmpCanvas.getContext("2d");
          tmpCtx.drawImage(imageBitmap, 0, 0);
          imageBitmap.close();
          var iData = tmpCtx.getImageData(0, 0, opts.toWidth, opts.toHeight);
          _this5.__mathlib.unsharp_mask(iData.data, opts.toWidth, opts.toHeight, opts.unsharpAmount, opts.unsharpRadius, opts.unsharpThreshold);
          toCtx.putImageData(iData, 0, 0);
          tmpCanvas.width = tmpCanvas.height = 0;
          iData = tmpCtx = tmpCanvas = toCtx = null;
          _this5.debug("Finished!");
          return to;
        });
      };
      Pica.prototype.resize = function(from, to, options) {
        var _this6 = this;
        this.debug("Start resize...");
        var opts = assign({}, DEFAULT_RESIZE_OPTS);
        if (!isNaN(options)) {
          opts = assign(opts, {
            quality: options
          });
        } else if (options) {
          opts = assign(opts, options);
        }
        opts.toWidth = to.width;
        opts.toHeight = to.height;
        opts.width = from.naturalWidth || from.width;
        opts.height = from.naturalHeight || from.height;
        if (Object.prototype.hasOwnProperty.call(opts, "quality")) {
          if (opts.quality < 0 || opts.quality > 3) {
            throw new Error("Pica: .quality should be [0..3], got ".concat(opts.quality));
          }
          opts.filter = filter_info.q2f[opts.quality];
        }
        if (to.width === 0 || to.height === 0) {
          return Promise.reject(new Error("Invalid output size: ".concat(to.width, "x").concat(to.height)));
        }
        if (opts.unsharpRadius > 2)
          opts.unsharpRadius = 2;
        opts.canceled = false;
        if (opts.cancelToken) {
          opts.cancelToken = opts.cancelToken.then(function(data) {
            opts.canceled = true;
            throw data;
          }, function(err) {
            opts.canceled = true;
            throw err;
          });
        }
        var DEST_TILE_BORDER = 3;
        opts.__destTileBorder = Math.ceil(Math.max(DEST_TILE_BORDER, 2.5 * opts.unsharpRadius | 0));
        return this.init().then(function() {
          if (opts.canceled)
            return opts.cancelToken;
          if (_this6.features.cib) {
            if (filter_info.q2f.indexOf(opts.filter) >= 0) {
              return _this6.__resizeViaCreateImageBitmap(from, to, opts);
            }
            _this6.debug("cib is enabled, but not supports provided filter, fallback to manual math");
          }
          if (!CAN_USE_CANVAS_GET_IMAGE_DATA) {
            var err = new Error("Pica: cannot use getImageData on canvas, make sure fingerprinting protection isn't enabled");
            err.code = "ERR_GET_IMAGE_DATA";
            throw err;
          }
          var stages = createStages(opts.width, opts.height, opts.toWidth, opts.toHeight, _this6.options.tile, opts.__destTileBorder);
          return _this6.__processStages(stages, from, to, opts);
        });
      };
      Pica.prototype.resizeBuffer = function(options) {
        var _this7 = this;
        var opts = assign({}, DEFAULT_RESIZE_OPTS, options);
        if (Object.prototype.hasOwnProperty.call(opts, "quality")) {
          if (opts.quality < 0 || opts.quality > 3) {
            throw new Error("Pica: .quality should be [0..3], got ".concat(opts.quality));
          }
          opts.filter = filter_info.q2f[opts.quality];
        }
        return this.init().then(function() {
          return _this7.__mathlib.resizeAndUnsharp(opts);
        });
      };
      Pica.prototype.toBlob = function(canvas, mimeType, quality) {
        mimeType = mimeType || "image/png";
        return new Promise(function(resolve) {
          if (canvas.toBlob) {
            canvas.toBlob(function(blob) {
              return resolve(blob);
            }, mimeType, quality);
            return;
          }
          if (canvas.convertToBlob) {
            resolve(canvas.convertToBlob({
              type: mimeType,
              quality
            }));
            return;
          }
          var asString = atob(canvas.toDataURL(mimeType, quality).split(",")[1]);
          var len2 = asString.length;
          var asBuffer = new Uint8Array(len2);
          for (var i = 0; i < len2; i++) {
            asBuffer[i] = asString.charCodeAt(i);
          }
          resolve(new Blob([asBuffer], {
            type: mimeType
          }));
        });
      };
      Pica.prototype.debug = function() {
      };
      module2.exports = Pica;
    }, {"./lib/mathlib": 1, "./lib/mm_resize/resize_filter_info": 7, "./lib/pool": 13, "./lib/stepper": 14, "./lib/tiler": 15, "./lib/utils": 16, "./lib/worker": 17, "object-assign": 22, webworkify: 23}]}, {}, [])("/index.js");
  });
});
var pica_default = pica;

// build/src/core/Helios-Core.js
var import_d3force3dLayoutWorker = __toModule(require_d3force3dLayoutWorker());

// build/src/shaders/edges.js
var vertexShader = `
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
 
uniform float globalWidthScale;

attribute vec3 fromVertex;
attribute vec3 toVertex;
attribute vec2 vertexType;
// 0,1:  0.0, 1.0, // source, top
// 0,0:  0.0, 0.0, // source, bottom
// 1,1:  1.0, 1.0, // target, top
// 1,0:  1.0, 0.0, // target, bottom

attribute vec4 fromColor;
attribute vec4 toColor;
attribute float fromSize;
attribute float toSize;
attribute vec4 encodedIndex;

varying vec4 vColor;
varying float vSize;
varying vec3 vOffset;
varying vec4 vEncodedIndex;


//varying float vZComponent;

void main(void){
	vColor = (fromColor)*vertexType.x + (toColor)*(1.0-vertexType.x);
	vSize = (fromSize)*vertexType.x + (toSize)*(1.0-vertexType.x);
	vEncodedIndex = encodedIndex;
	//vZComponent = viewVertex.z;
	vec3 vertexCenter = fromVertex.xyz*vertexType.x + toVertex.xyz*(1.0-vertexType.x);
	vec3 destinationVertexCenter = fromVertex.xyz*(1.0-vertexType.x) + toVertex.xyz*vertexType.x;
	
	vec3 displacement = (viewMatrix*vec4((destinationVertexCenter-vertexCenter),0.0)).xyz;
	vec3 perpendicularVector = normalize(vec3(-displacement.y, displacement.x, 0.0));
	vec3 offset = globalWidthScale*vSize*(vertexType.x-0.5)*(vertexType.y-0.5)*4.0*1.5*perpendicularVector;
	
	vec4 viewVertex = viewMatrix * vec4(vertexCenter.xyz,1.0)+vec4(offset,0.0);
	float displacementLength = length(displacement);
	vOffset = vec3(vertexType.x,toSize/displacementLength*1.5,fromSize/displacementLength*1.5);
	gl_Position = projectionMatrix*viewVertex;
	
}
`;
var fragmentShader = `
#ifdef GL_ES
	precision highp float;
#endif
//uniform vec2 nearFar;
uniform float globalOpacity;
varying vec4 vEncodedIndex;
varying vec4 vColor;
varying vec3 vOffset;
//varying float vZComponent;
//gl_DepthRange.near)/gl_DepthRange.diff
void main(){
	//float w = (-vZComponent-nearFar[0])/(nearFar[1]-nearFar[0]);
	if(vOffset.x<vOffset.y || vOffset.x>(1.0-vOffset.z)){
		discard;
	}

	// gl_FragColor = vec4(vOffset.x,vOffset.x,0,1.0);//vec4(vColor.xyz,globalOpacity*vColor.w);
	gl_FragColor = vec4(vColor.xyz,globalOpacity*vColor.w);
}
`;
var pickingShader = `
#ifdef GL_ES
	precision highp float;
#endif
//uniform vec2 nearFar;
varying vec4 vEncodedIndex;
varying vec4 vColor;
varying vec3 vOffset;
//varying float vZComponent;
//gl_DepthRange.near)/gl_DepthRange.diff
void main(){

	if(vOffset.x<vOffset.y*1.1 || vOffset.x>(1.0-vOffset.z*1.1)){
		discard;
	}
	//float w = (-vZComponent-nearFar[0])/(nearFar[1]-nearFar[0]);
	gl_FragColor = vEncodedIndex;
	
}
`;
var fastVertexShader = `
uniform mat4 projectionViewMatrix;

attribute vec3 vertex;
attribute vec4 color;
varying vec4 vColor;

varying vec4 vEncodedIndex;

//varying float vZComponent;

void main(void){
	vColor = color;
	//vZComponent = viewVertex.z;
	gl_Position =   projectionViewMatrix * vec4(vertex,1.0);
}
`;
var fastFragmentShader = `
#ifdef GL_ES
	precision highp float;
#endif
//uniform vec2 nearFar;
uniform float globalOpacity;
varying vec4 vColor;
//varying float vZComponent;
//gl_DepthRange.near)/gl_DepthRange.diff
void main(){
	//float w = (-vZComponent-nearFar[0])/(nearFar[1]-nearFar[0]);
	gl_FragColor = vec4(vColor.xyz,globalOpacity*vColor.w);
	// gl_FragColor = vec4(vEncodedIndex.x/10,0,0,1.0);
}

`;

// build/src/shaders/nodes.js
var vertexShader2 = `
// uniform mat4 projectionMatrix;
// uniform mat4 viewMatrix;
// uniform mat3 normalMatrix;


// attribute vec4 vertex;
// attribute vec3 normal;
// attribute vec3 position;
// attribute vec3 color;
// attribute float size;
// attribute float Opacity;

// varying vec3 vNormal;
// varying vec3 vEye;

// varying vec3 vColor;
// varying float vSize;
// varying float vOpacity;

// void main(void){
// 	vec4 viewVertex = viewMatrix * (vertex*vec4(vec3(size),1.0) + vec4(position,0.0));
// 	vNormal = normalMatrix * normal;
// 	vEye = -vec3(viewVertex);
// 	vOpacity = Opacity;
// 	vColor = color;
// 	gl_Position =   projectionMatrix * viewVertex;
// }

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;

attribute vec2 vertex;
// attribute vec3 normal;
attribute vec3 position;
attribute vec4 color;
attribute float size;
attribute float outlineWidth;
attribute vec4 outlineColor;
attribute vec4 encodedIndex;

varying vec3 vNormal;
varying vec3 vEye;
varying vec4 vColor;
varying vec2 vOffset;
varying float vSize;
varying vec4 vEncodedIndex;
varying float vOutlineThreshold;
varying vec4 vOutlineColor;
varying vec4 vPosition;

void main(void){
	float BoxCorrection = 1.5;
	vec2 offset = vertex;
	float fullSize = size + outlineWidth;
	// vec4 viewCenters = viewMatrix*vec4(position,1);
	// vec3 viewCenters = position;
	// fragCenter = viewCenters
	// float scalingFactor = 1.0 / abs(centers.x)*0.001;
	// offset*=scalingFactor;
	vec3 cameraRight = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
	vec3 cameraUp = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));

	// viewCenters.xy += offset*size*CameraRight_worldspace;
	
	vec4 viewCenters = viewMatrix*vec4(position+BoxCorrection*fullSize*(cameraRight*offset.x + cameraUp*offset.y),1.0);
	vNormal = vec3(0.0,0.0,1.0); //normalMatrix * normal;
	vEye = -vec3(offset,0.0);
	vEncodedIndex = encodedIndex;
	vColor = color;
	vOffset = vertex;
	vSize = size;
	vOutlineThreshold = outlineWidth/fullSize;
	vOutlineColor = outlineColor;
	vPosition = projectionMatrix * viewCenters;
	gl_Position = vPosition;
}
`;
var fragmentShader2 = `// #ifdef GL_ES
// 	precision highp float;
// #endif

precision mediump float;
uniform float globalOpacity;
varying vec4 vColor;
varying vec4 vEncodedIndex;
varying vec3 vNormal;
varying vec3 vEye;
varying float vSize;
varying vec2 vOffset;
varying float vOutlineThreshold;
varying vec4 vOutlineColor;
varying vec4 vPosition;



void main(){
	// const vec3 lightDirection = vec3(0.577350269,0.577350269,0.577350269);
	// const float ambientFactor = 0.6;
	
	// vec3 normal = normalize(vNormal);
	// vec3 eye = normalize(vEye);
	
	// //Ambient+Diffuse
	// float cosTheta = max(dot(lightDirection,normal),0.0);
	// vec3 newColor = vColor*(ambientFactor+cosTheta);
	
	// //Specular
	// vec3 reflection = reflect(-lightDirection, normal);
	// float eyeDotReflection = max(dot(eye, reflection), 0.0);
	// newColor +=  vec3(0.5)* pow(eyeDotReflection, 60.0);
	
	// gl_FragColor = vec4(newColor,vOpacity);
	// gl_FragColor = vec4(eye,Opacity);
	//gl_FragData[0] = vec4(newColor,Opacity);

// Renaming variables passed from the Vertex Shader

	// vec3 cameraPos;
	// vec3 cameraNormal;

	// float lensqr = dot(vOffset, vOffset);

	// if(lensqr > 1.0)
	// 		discard;
		
	// cameraNormal = vec3(vOffset, sqrt(1.0 - lensqr));
	// cameraPos = (cameraNormal * size) + cameraSpherePos;

	// float len = length(point);
	// // VTK Fake Spheres
	// float radius = 1.;
	// if(len > radius)
	// 		discard;
	// vec3 normalizedPoint = normalize(vec3(point.xy, sqrt(1. - len)));
	// vec3 direction = normalize(vec3(1., 1., 1.));
	// float df2 = max(0, dot(direction, normalizedPoint));
	// float sf2 = pow(df2, 90);
	// fragOutput0 = vec4(max((df2+0.3) * color, sf2 * vec3(1)), 1);

	// fragOutput1 = vec4(vertexVC.xyz, 1.0);
	// fragOutput2 = vec4(normalVCVSOutput, 1.0);
	
	float lensqr = dot(vOffset, vOffset);

	if(lensqr > 1.0)
			discard;
	

	vec3 normalizedPoint = normalize(vec3(vOffset.xy, sqrt(1. - lensqr)));
	const vec3 lightDirection = vec3(0.577350269,0.577350269,0.577350269);
	const float ambientFactor = 0.6;
	
	vec3 normal = normalizedPoint;
	vec3 eye = normalize(vEye);
	
	//Ambient+Diffuse
	float cosTheta = max(dot(lightDirection,normal),0.0);
	vec3 newColor = vColor.xyz*(ambientFactor+cosTheta);
	
	//Specular
	vec3 reflection = reflect(-lightDirection, normal);
	float eyeDotReflection = max(dot(eye, reflection), 0.0);
	newColor +=  vec3(0.5)* pow(eyeDotReflection, 60.0);
	
	
	
	if(lensqr < 1.0-vOutlineThreshold){
		// gl_FragColor = vec4(vColor,vOpacity)
		gl_FragColor = vec4(newColor,vColor.w*globalOpacity);;
	}else{
		gl_FragColor = vec4(vOutlineColor.xyz,vOutlineColor.w*globalOpacity);
	}
	// gl_FragDepthEXT = 0.5; 
}
`;
var pickingShader2 = `
// #ifdef GL_ES
// 	precision highp float;
// #endif

precision mediump float;
varying vec4 vColor;
varying vec4 vEncodedIndex;
varying vec3 vNormal;
varying vec3 vEye;
varying float vSize;
varying vec2 vOffset;
varying float vOutlineThreshold;
varying vec4 vOutlineColor;

void main(){
	float lensqr = dot(vOffset, vOffset);

	if(lensqr > 1.0)
			discard;
	
	gl_FragColor = vEncodedIndex;
}
`;
var fastFragmentShader2 = `
// #ifdef GL_ES
// 	precision highp float;
// #endif

precision mediump float;
uniform float globalOpacity;
varying vec4 vColor;
varying vec4 vEncodedIndex;
varying vec3 vNormal;
varying vec3 vEye;
varying float vSize;
varying vec2 vOffset;
varying float vOutlineThreshold;
varying vec4 vOutlineColor;
varying vec4 vPosition;



void main(){
	
	float lensqr = dot(vOffset, vOffset);

	if(lensqr > 1.0)
			discard;
	
	if(lensqr < 1.0-vOutlineThreshold){
		// gl_FragColor = vec4(vColor,vOpacity)
		gl_FragColor = vec4(vColor.xyz,vColor.w*globalOpacity);;
	}else{
		gl_FragColor = vec4(vOutlineColor.xyz,vOutlineColor.w*globalOpacity);
	}
	// gl_FragDepthEXT = 0.5; 
}
`;
var fastVertexShader2 = vertexShader2;

// build/src/core/Helios-Core.js
import.meta.env = env_exports;
var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
var Helios = class {
  constructor({
    elementID,
    nodes = {},
    edges = [],
    use2D = false,
    shadedNodes = false,
    fastEdges = false,
    forceSupersample = false,
    autoStartLayout = true
  }) {
    this.element = document.getElementById(elementID);
    this.element.innerHTML = "";
    this.canvasElement = document.createElement("canvas");
    this.element.appendChild(this.canvasElement);
    this.network = new Network(nodes, edges);
    this.rotationMatrix = mat4.create();
    this.translatePosition = vec3.create();
    this.mouseDown = false;
    this.lastMouseX = null;
    this.lastMouseY = null;
    this.redrawingFromMouseWheelEvent = false;
    this.fastEdges = fastEdges;
    this.animate = false;
    this.shadedNodes = shadedNodes;
    this.forceSupersample = forceSupersample;
    this.cameraDistance = 450;
    this._zoomFactor = 1;
    this.interacting = false;
    this.rotateLinearX = 0;
    this.rotateLinearY = 0;
    this.panX = 0;
    this.panY = 0;
    this.saveResolutionRatio = 1;
    this.pickingResolutionRatio = 0.25;
    this._edgesGlobalOpacity = 1;
    this._nodesGlobalOpacity = 1;
    this._globalWidthScale = 0.25;
    this._use2D = use2D;
    this._autoStartLayout = autoStartLayout;
    this.useAdditiveBlending = false;
    this.scheduler = new HeliosScheduler(this, {throttle: false});
    if (this._use2D) {
      for (let vertexIndex = 0; vertexIndex < this.network.positions.length; vertexIndex++) {
        this.network.positions[vertexIndex * 3 + 2] = 0;
      }
    }
    mat4.identity(this.rotationMatrix);
    this.gl = createWebGLContext(this.canvasElement, {
      antialias: true,
      powerPreference: "high-performance",
      desynchronized: true
    });
    this.centerNode = null;
    this.centerNodeTransition = null;
    this.previousTranslatePosition = null;
    this.onNodeClickCallback = null;
    this.onNodeDoubleClickCallback = null;
    this.onNodeHoverStartCallback = null;
    this.onNodeHoverMoveCallback = null;
    this.onNodeHoverEndCallback = null;
    this.onEdgeClickCallback = null;
    this.onEdgeDoubleClickCallback = null;
    this.onEdgeHoverStartCallback = null;
    this.onEdgeHoverMoveCallback = null;
    this.onEdgeHoverEndCallback = null;
    this.onZoomCallback = null;
    this.onRotationCallback = null;
    this.onResizeCallback = null;
    this.onLayoutStartCallback = null;
    this.onLayoutStopCallback = null;
    this.onDrawCallback = null;
    this.onReadyCallback = null;
    this.isReady = false;
    this._backgroundColor = [0.5, 0.5, 0.5, 1];
    this.initialize();
    window.onresize = (event) => {
      this.willResizeEvent(event);
    };
  }
  initialize() {
    this._setupShaders();
    this._buildNodesGeometry();
    this._buildPickingBuffers();
    this._buildEdgesGeometry();
    this.willResizeEvent(0);
    this._setupCamera();
    this._setupEvents();
    this._setupLayout();
    this.scheduler.start();
    this.onReadyCallback?.(this);
    this.onReadyCallback = null;
    this.isReady = true;
  }
  _setupLayout() {
    this.newPositions = this.network.positions.slice(0);
    this.positionInterpolator = null;
    let onlayoutUpdate = (data) => {
      this.newPositions = data.positions;
      let interpolatorTask = {
        name: "1.1.positionInterpolator",
        callback: (elapsedTime, task) => {
          let maxDisplacement = 0;
          for (let index = 0; index < this.network.positions.length; index++) {
            let displacement = this.newPositions[index] - this.network.positions[index];
            this.network.positions[index] += 0.01 * displacement * elapsedTime / 10;
            maxDisplacement = Math.max(Math.abs(displacement), maxDisplacement);
          }
          ;
          if (maxDisplacement < 1) {
            this.scheduler.unschedule("1.1.positionInterpolator");
          }
        },
        delay: 0,
        repeat: true,
        synchronized: true,
        immediateUpdates: false,
        redraw: true,
        updateNodesGeometry: true,
        updateEdgesGeometry: true
      };
      this.scheduler.schedule({
        name: "1.0.positionChange",
        callback: (elapsedTime, task) => {
          this.scheduler.schedule(interpolatorTask);
        },
        delay: 0,
        repeat: false,
        synchronized: true,
        immediateUpdates: false,
        redraw: false,
        updateNodesGeometry: false,
        updateEdgesGeometry: false
      });
    };
    let onLayoutStop = () => {
      this.onLayoutStopCallback?.();
    };
    let onLayoutStart = () => {
      this.onLayoutStartCallback?.();
    };
    this.layoutWorker = new import_d3force3dLayoutWorker.layoutWorker({
      network: this.network,
      onUpdate: onlayoutUpdate,
      onStop: onLayoutStop,
      onStart: onLayoutStart,
      use2D: this._use2D
    });
    if (this._autoStartLayout) {
      this.layoutWorker.start();
    }
  }
  pauseLayout() {
    this.layoutWorker.pause();
  }
  resumeLayout() {
    this.layoutWorker.resume();
  }
  _callEventFromPickID(pickID, eventType, event) {
    let pickObject = null;
    let isNode2 = true;
    if (pickID >= 0) {
      if (pickID < this.network.nodeCount) {
        isNode2 = true;
        pickObject = this.network.index2Node[pickID];
      } else if (pickID >= this.network.nodeCount) {
        let edgeIndex = pickID - this.network.nodeCount;
        if (edgeIndex < this.network.indexedEdges.length / 2) {
          let edge = {
            source: this.network.index2Node[this.network.indexedEdges[2 * edgeIndex]],
            target: this.network.index2Node[this.network.indexedEdges[2 * edgeIndex + 1]],
            index: edgeIndex
          };
          isNode2 = false;
          pickObject = edge;
        }
      }
    }
    if (pickObject) {
      switch (eventType) {
        case "click": {
          if (isNode2) {
            this.onNodeClickCallback?.(pickObject, event);
          } else {
            this.onEdgeClickCallback?.(pickObject, event);
          }
          break;
        }
        case "doubleClick": {
          if (isNode2) {
            this.onNodeDoubleClickCallback?.(pickObject, event);
          } else {
            this.onEdgeDoubleClickCallback?.(pickObject, event);
          }
          break;
        }
        case "hoverStart": {
          if (isNode2) {
            this.onNodeHoverStartCallback?.(pickObject, event);
          } else {
            this.onEdgeHoverStartCallback?.(pickObject, event);
          }
          break;
        }
        case "hoverMove": {
          if (isNode2) {
            this.onNodeHoverMoveCallback?.(pickObject, event);
          } else {
            this.onEdgeHoverMoveCallback?.(pickObject, event);
          }
          break;
        }
        case "hoverEnd": {
          if (isNode2) {
            this.onNodeHoverEndCallback?.(pickObject, event);
          } else {
            this.onEdgeHoverEndCallback?.(pickObject, event);
          }
          break;
        }
        default:
          break;
      }
    }
  }
  _setupEvents() {
    this.lastMouseX = -1;
    this.lastMouseY = -1;
    this.currentHoverIndex = -1;
    this.canvasElement.onclick = (e) => {
      const rect = this.canvasElement.getBoundingClientRect();
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      const pickID = this.pickPoint(this.lastMouseX - rect.left, this.lastMouseY - rect.top);
      if (pickID >= 0) {
        this._callEventFromPickID(pickID, "click", e);
      }
    };
    this.canvasElement.ondblclick = (e) => {
      const rect = this.canvasElement.getBoundingClientRect();
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      const pickID = this.pickPoint(this.lastMouseX - rect.left, this.lastMouseY - rect.top);
      if (pickID >= 0) {
        this._callEventFromPickID(pickID, "doubleClick", e);
      }
    };
    this.canvasElement.addEventListener("mousemove", (event) => {
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
      this.triggerHoverEvents(event);
    });
    this.canvasElement.addEventListener("mouseleave", (e) => {
      if (this.currentHoverIndex >= 0) {
        this._callEventFromPickID(this.currentHoverIndex, "hoverEnd", e);
        this.currentHoverIndex = -1;
        this.lastMouseX = -1;
        this.lastMouseY = -1;
      }
    });
    document.body.addEventListener("mouseout", (e) => {
      if (!e.relatedTarget && !e.toElement) {
        if (this.currentHoverIndex >= 0) {
          this._callEventFromPickID(this.currentHoverIndex, "hoverEnd", e);
          this.currentHoverIndex = -1;
          this.lastMouseX = -1;
          this.lastMouseY = -1;
        }
      }
    });
  }
  async _downloadImageData(imagedata, filename, supersampleFactor, fileFormat) {
    let pica2 = new pica_default({});
    let canvas = document.createElement("canvas");
    let canvasFullSize = document.createElement("canvas");
    let ctx = canvas.getContext("2d");
    let ctxFullSize = canvasFullSize.getContext("2d");
    canvasFullSize.width = imagedata.width;
    canvasFullSize.height = imagedata.height;
    canvas.width = imagedata.width / supersampleFactor;
    canvas.height = imagedata.height / supersampleFactor;
    ctx.imageSmoothingEnabled = true;
    ctxFullSize.imageSmoothingEnabled = true;
    if (typeof ctx.imageSmoothingQuality !== "undefined") {
      ctx.imageSmoothingQuality = "high";
    }
    if (typeof ctxFullSize.imageSmoothingQuality !== "undefined") {
      ctxFullSize.imageSmoothingQuality = "high";
    }
    ctxFullSize.putImageData(imagedata, 0, 0);
    await pica2.resize(canvasFullSize, canvas, {
      alpha: true
    });
    let downloadLink = document.createElement("a");
    if (isSafari) {
      console.log("Workaround safari bug...");
      canvas.toDataURL();
    }
    downloadLink.setAttribute("download", filename);
    let blob = await pica2.toBlob(canvas, "image/png");
    if (blob) {
      if (filename.endsWith("svg")) {
        let svgText = `
				<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
				width="${canvas.width}" height="${canvas.width}"
				>
				<image
						width="${canvas.width}" height="${canvas.width}"
						xlink:href="${blob}"
						/>
				</svg>`;
        downloadLink.setAttribute("download", filename);
        let blobSVG = new Blob([svgText], {type: "image/svg+xml"});
        let url = URL.createObjectURL(blobSVG);
        downloadLink.setAttribute("href", url);
        downloadLink.click();
      } else {
        let url = URL.createObjectURL(blob);
        downloadLink.setAttribute("href", url);
        downloadLink.click();
      }
    } else {
      window.alert(`An error occured while trying to download the image. Please try again. (Error: blob is null.)`);
    }
    if (filename.endsWith("svg")) {
      let svgText = `
			<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
			width="${canvas.width}" height="${canvas.width}"
			>
			<image
					width="${canvas.width}" height="${canvas.width}"
					xlink:href="${canvas.toDataURL()}"
					/>
			</svg>`;
      downloadLink.setAttribute("download", filename);
      let blob2 = new Blob([svgText], {type: "image/svg+xml"});
      let url = URL.createObjectURL(blob2);
      downloadLink.setAttribute("href", url);
      downloadLink.click();
    } else if (false) {
      downloadLink.setAttribute("download", filename);
      downloadLink.setAttribute("href", canvas.toDataURL("image/png").replace("image/png", "image/octet-stream"));
      downloadLink.click();
    } else {
    }
  }
  framebufferImage(framebuffer) {
    const fbWidth = framebuffer.size.width;
    const fbHeight = framebuffer.size.height;
    const data = new Uint8ClampedArray(4 * fbWidth * fbHeight);
    let gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.readPixels(0, 0, fbWidth, fbHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return new ImageData(data, fbWidth, fbHeight);
  }
  exportFigure(filename, {
    scale = 1,
    supersampleFactor = 4,
    width = null,
    height = null,
    backgroundColor = null
  }) {
    if (typeof scale === "undefined") {
      scale = 1;
    }
    if (typeof supersampleFactor === "undefined") {
      supersampleFactor = 2;
    }
    let framebuffer = this.createOffscreenFramebuffer();
    if (width == null && height == null) {
      width = this.canvasElement.width;
      height = this.canvasElement.height;
    } else if (width == null) {
      width = Math.round(height * this.canvasElement.width / this.canvasElement.height);
    } else if (height == null) {
      height = Math.round(width * this.canvasElement.height / this.canvasElement.width);
    }
    if (backgroundColor == null) {
      backgroundColor = this.backgroundColor;
    }
    framebuffer.setSize(width * scale * supersampleFactor, height * scale * supersampleFactor);
    framebuffer.backgroundColor = backgroundColor;
    this._redrawAll(framebuffer);
    let image = this.framebufferImage(framebuffer);
    this._downloadImageData(image, filename, supersampleFactor);
    framebuffer.discard();
  }
  triggerHoverEvents(event, shallCancel) {
    if (this.lastMouseX == -1 || this.lastMouseY == -1) {
      return;
    }
    let pickID = -1;
    if (!this.interacting) {
      const rect = this.canvasElement.getBoundingClientRect();
      pickID = this.pickPoint(this.lastMouseX - rect.left, this.lastMouseY - rect.top);
    }
    if (pickID >= 0 && this.currentHoverIndex == -1) {
      this.currentHoverIndex = pickID;
      this._callEventFromPickID(pickID, "hoverStart", event);
    } else if (pickID >= 0 && this.currentHoverIndex == pickID) {
      this._callEventFromPickID(pickID, "hoverMove", event);
    } else if (pickID >= 0 && this.currentHoverIndex != pickID) {
      this._callEventFromPickID(this.currentHoverIndex, "hoverEnd", event);
      this.currentHoverIndex = pickID;
      this._callEventFromPickID(pickID, "hoverStart", event);
    } else if (pickID == -1 && this.currentHoverIndex != pickID) {
      this._callEventFromPickID(this.currentHoverIndex, "hoverEnd", event);
      this.currentHoverIndex = -1;
    }
  }
  _setupShaders() {
    let gl = this.gl;
    this.edgesShaderProgram = new ShaderProgram(getShaderFromString(gl, vertexShader, gl.VERTEX_SHADER), getShaderFromString(gl, fragmentShader, gl.FRAGMENT_SHADER), ["viewMatrix", "projectionMatrix", "nearFar", "globalOpacity", "globalWidthScale"], ["fromVertex", "toVertex", "vertexType", "fromColor", "toColor", "fromSize", "toSize", "encodedIndex"], this.gl);
    this.edgesFastShaderProgram = new ShaderProgram(getShaderFromString(gl, fastVertexShader, gl.VERTEX_SHADER), getShaderFromString(gl, fastFragmentShader, gl.FRAGMENT_SHADER), ["projectionViewMatrix", "nearFar", "globalOpacity"], ["vertex", "color"], this.gl);
    this.edgesPickingShaderProgram = new ShaderProgram(getShaderFromString(gl, vertexShader, gl.VERTEX_SHADER), getShaderFromString(gl, pickingShader, gl.FRAGMENT_SHADER), ["viewMatrix", "projectionMatrix", "nearFar", "globalOpacity", "globalWidthScale"], ["fromVertex", "toVertex", "vertexType", "fromColor", "toColor", "fromSize", "toSize", "encodedIndex"], this.gl);
    this.nodesShaderProgram = new ShaderProgram(getShaderFromString(gl, vertexShader2, gl.VERTEX_SHADER), getShaderFromString(gl, fragmentShader2, gl.FRAGMENT_SHADER), ["viewMatrix", "projectionMatrix", "normalMatrix", "globalOpacity"], ["vertex", "position", "color", "size", "outlineWidth", "outlineColor", "encodedIndex"], this.gl);
    this.nodesFastShaderProgram = new ShaderProgram(getShaderFromString(gl, fastVertexShader2, gl.VERTEX_SHADER), getShaderFromString(gl, fastFragmentShader2, gl.FRAGMENT_SHADER), ["viewMatrix", "projectionMatrix", "normalMatrix", "globalOpacity"], ["vertex", "position", "color", "size", "outlineWidth", "outlineColor", "encodedIndex"], this.gl);
    this.nodesPickingShaderProgram = new ShaderProgram(getShaderFromString(gl, vertexShader2, gl.VERTEX_SHADER), getShaderFromString(gl, pickingShader2, gl.FRAGMENT_SHADER), ["viewMatrix", "projectionMatrix", "normalMatrix"], ["vertex", "position", "color", "size", "outlineWidth", "outlineColor", "encodedIndex"], this.gl);
  }
  _buildPickingBuffers() {
    let gl = this.gl;
    this.pickingFramebuffer = this.createOffscreenFramebuffer();
  }
  createOffscreenFramebuffer() {
    let gl = this.gl;
    let framebuffer = gl.createFramebuffer();
    framebuffer.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, framebuffer.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    framebuffer.depthBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, framebuffer.depthBuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    framebuffer.size = {
      width: 0,
      height: 0
    };
    framebuffer.setSize = (width, height) => {
      gl.bindTexture(gl.TEXTURE_2D, framebuffer.texture);
      const level2 = 0;
      const internalFormat = gl.RGBA;
      const border = 0;
      const format = gl.RGBA;
      const type = gl.UNSIGNED_BYTE;
      const data = null;
      const fbWidth = width;
      const fbHeight = height;
      gl.texImage2D(gl.TEXTURE_2D, level2, internalFormat, fbWidth, fbHeight, border, format, type, data);
      gl.bindRenderbuffer(gl.RENDERBUFFER, framebuffer.depthBuffer);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, fbWidth, fbHeight);
      framebuffer.size.width = width;
      framebuffer.size.height = height;
    };
    framebuffer.discard = () => {
      gl.deleteRenderbuffer(framebuffer.depthBuffer);
      gl.deleteTexture(framebuffer.texture);
      gl.deleteFramebuffer(framebuffer);
    };
    const attachmentPoint = gl.COLOR_ATTACHMENT0;
    const level = 0;
    gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, framebuffer.texture, level);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, framebuffer.depthBuffer);
    return framebuffer;
  }
  _buildNodesGeometry() {
    let gl = this.gl;
    let sphereQuality = 20;
    this.nodesGeometry = makePlane(gl, false, false);
    this.nodesPositionBuffer = gl.createBuffer();
    this.nodesColorBuffer = gl.createBuffer();
    this.nodesSizeBuffer = gl.createBuffer();
    this.nodesOutlineWidthBuffer = gl.createBuffer();
    this.nodesOutlineColorBuffer = gl.createBuffer();
    this.nodesIndexBuffer = gl.createBuffer();
    this.nodesIndexArray = new Float32Array(this.network.index2Node.length * 4);
    for (let ID = 0; ID < this.network.index2Node.length; ID++) {
      this.nodesIndexArray[4 * ID] = (ID + 1 >> 0 & 255) / 255;
      this.nodesIndexArray[4 * ID + 1] = (ID + 1 >> 8 & 255) / 255;
      this.nodesIndexArray[4 * ID + 2] = (ID + 1 >> 16 & 255) / 255;
      this.nodesIndexArray[4 * ID + 3] = (ID + 1 >> 24 & 255) / 255;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesIndexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.nodesIndexArray, gl.STATIC_DRAW);
    this.updateNodesGeometry();
  }
  updateNodesGeometry() {
    let gl = this.gl;
    let positions = this.network.positions;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    let colors2 = this.network.colors;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors2, gl.STATIC_DRAW);
    let sizes = this.network.sizes;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesSizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);
    let outlineWidths = this.network.outlineWidths;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesOutlineWidthBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, outlineWidths, gl.STATIC_DRAW);
    let outlineColors = this.network.outlineColors;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesOutlineColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, outlineColors, gl.STATIC_DRAW);
  }
  _buildFastEdgesGeometry() {
    let gl = this.gl;
    let edges = this.network.indexedEdges;
    let positions = this.network.positions;
    let colors2 = this.network.colors;
    let indicesArray;
    this.fastEdgesGeometry = null;
    this.fastEdgesIndicesArray = null;
    let newGeometry = new Object();
    if (positions.length < 65535) {
      indicesArray = new Uint16Array(edges);
      newGeometry.indexType = gl.UNSIGNED_SHORT;
    } else {
      var uints_for_indices = gl.getExtension("OES_element_index_uint");
      if (uints_for_indices == null) {
        indicesArray = new Uint16Array(edges);
        newGeometry.indexType = gl.UNSIGNED_SHORT;
      } else {
        indicesArray = new Uint32Array(edges);
        newGeometry.indexType = gl.UNSIGNED_INT;
      }
    }
    newGeometry.vertexObject = gl.createBuffer();
    newGeometry.colorObject = gl.createBuffer();
    newGeometry.numIndices = indicesArray.length;
    newGeometry.indexObject = gl.createBuffer();
    this.fastEdgesGeometry = newGeometry;
    this.fastEdgesIndicesArray = indicesArray;
  }
  _buildAdvancedEdgesGeometry() {
    let gl = this.gl;
    let edgeVertexTypeArray = [
      0,
      1,
      0,
      0,
      1,
      1,
      1,
      0
    ];
    let newGeometry = new Object();
    newGeometry.edgeVertexTypeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, newGeometry.edgeVertexTypeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(edgeVertexTypeArray), gl.STATIC_DRAW);
    newGeometry.verticesBuffer = gl.createBuffer();
    newGeometry.colorBuffer = gl.createBuffer();
    newGeometry.sizeBuffer = gl.createBuffer();
    newGeometry.indexBuffer = gl.createBuffer();
    newGeometry.edgesIndexArray = new Float32Array(this.network.indexedEdges.length * 4 / 2);
    for (let ID = 0; ID < this.network.indexedEdges.length / 2; ID++) {
      let edgeID = this.network.index2Node.length + ID;
      newGeometry.edgesIndexArray[4 * ID] = (edgeID + 1 >> 0 & 255) / 255;
      newGeometry.edgesIndexArray[4 * ID + 1] = (edgeID + 1 >> 8 & 255) / 255;
      newGeometry.edgesIndexArray[4 * ID + 2] = (edgeID + 1 >> 16 & 255) / 255;
      newGeometry.edgesIndexArray[4 * ID + 3] = (edgeID + 1 >> 24 & 255) / 255;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, newGeometry.indexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, newGeometry.edgesIndexArray, gl.STATIC_DRAW);
    newGeometry.count = this.network.indexedEdges.length / 2;
    this.edgesGeometry = newGeometry;
  }
  _buildEdgesGeometry() {
    if (this.fastEdges) {
      this._buildFastEdgesGeometry();
    } else {
      this._buildAdvancedEdgesGeometry();
    }
    this.updateEdgesGeometry();
  }
  updateEdgesGeometry() {
    let gl = this.gl;
    let edges = this.network.indexedEdges;
    let positions = this.network.positions;
    let colors2 = this.network.colors;
    if (this.fastEdges) {
      if (!this.fastEdgesGeometry) {
        this._buildEdgesGeometry();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fastEdgesGeometry.vertexObject);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fastEdgesGeometry.colorObject);
      gl.bufferData(gl.ARRAY_BUFFER, colors2, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.fastEdgesGeometry.indexObject);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.fastEdgesIndicesArray, gl.STREAM_DRAW);
    } else {
      let gl2 = this.gl;
      this.network.updateEdgePositions();
      this.network.updateEdgeColors();
      this.network.updateEdgeSizes();
      let edgePositions = this.network.positions;
      gl2.bindBuffer(gl2.ARRAY_BUFFER, this.edgesGeometry.verticesBuffer);
      gl2.bufferData(gl2.ARRAY_BUFFER, this.network.edgePositions, gl2.DYNAMIC_DRAW);
      gl2.bindBuffer(gl2.ARRAY_BUFFER, this.edgesGeometry.colorBuffer);
      gl2.bufferData(gl2.ARRAY_BUFFER, this.network.edgeColors, gl2.DYNAMIC_DRAW);
      gl2.bindBuffer(gl2.ARRAY_BUFFER, this.edgesGeometry.sizeBuffer);
      gl2.bufferData(gl2.ARRAY_BUFFER, this.network.edgeSizes, gl2.DYNAMIC_DRAW);
    }
  }
  resizeGL(newWidth, newHeight) {
    this.pickingFramebuffer.setSize(newWidth * this.pickingResolutionRatio, newHeight * this.pickingResolutionRatio);
    this.render(true);
  }
  _setupCamera() {
    this.zoom = zoom().on("zoom", (event) => {
      this._zoomFactor = event.transform.k;
      this.triggerHoverEvents(event);
      if (this.prevK === void 0) {
        this.prevK = event.transform.k;
      }
      let dx = 0;
      let dy = 0;
      if (this.prevK == event.transform.k) {
        if (this.prevX === void 0) {
          dx = event.transform.x;
          dy = event.transform.y;
        } else {
          dx = event.transform.x - this.prevX * this._zoomFactor;
          dy = event.transform.y - this.prevY * this._zoomFactor;
        }
      } else {
      }
      this.prevX = event.transform.x / this._zoomFactor;
      this.prevY = event.transform.y / this._zoomFactor;
      this.prevK = event.transform.k;
      let newRotationMatrix = mat4.create();
      if (this._use2D || event.sourceEvent?.shiftKey) {
        let perspectiveFactor = this.cameraDistance * this._zoomFactor;
        let aspectRatio = this.canvasElement.width / this.canvasElement.height;
        this.panX = this.panX + dx / this._zoomFactor;
        this.panY = this.panY - dy / this._zoomFactor;
      } else {
        mat4.identity(newRotationMatrix);
        mat4.rotate(newRotationMatrix, newRotationMatrix, degToRad(dx / 2), [0, 1, 0]);
        mat4.rotate(newRotationMatrix, newRotationMatrix, degToRad(dy / 2), [1, 0, 0]);
        mat4.multiply(this.rotationMatrix, newRotationMatrix, this.rotationMatrix);
      }
      if (!this.positionInterpolator) {
        this.update();
        this.render();
      }
      (event2) => event2.preventDefault();
    }).on("start", (event) => {
      this.interacting = true;
    }).on("end", (event) => {
      this.interacting = false;
    });
    select(this.canvasElement).call(this.zoom).on("dblclick.zoom", null);
  }
  zoomFactor(zoomFactor, duration) {
    if (zoomFactor !== void 0) {
      if (duration === void 0) {
        select(this.canvasElement).call(this.zoom.transform, identity$1.translate(0, 0).scale(zoomFactor));
      } else {
        select(this.canvasElement).transition().duration(duration).call(this.zoom.transform, identity$1.translate(0, 0).scale(zoomFactor));
      }
      return this;
    } else {
      return this._zoomFactor;
    }
  }
  willResizeEvent(event) {
    let dpr = window.devicePixelRatio || 1;
    if (dpr < 2 || this.forceSupersample) {
      dpr = 2;
    }
    this.canvasElement.style.width = this.element.clientWidth + "px";
    this.canvasElement.style.height = this.element.clientHeight + "px";
    this.canvasElement.width = dpr * this.element.clientWidth;
    this.canvasElement.height = dpr * this.element.clientHeight;
    this.resizeGL(this.canvasElement.width, this.canvasElement.height);
    this.onResizeCallback?.(event);
  }
  redraw() {
    this._redrawAll(null, false);
    this._redrawAll(this.pickingFramebuffer, true);
    this.onDrawCallback?.();
    this.triggerHoverEvents(null);
  }
  update(immediate = false) {
    this.scheduler.schedule({
      name: "9.0.update",
      callback: null,
      delay: 0,
      repeat: false,
      synchronized: true,
      immediateUpdates: immediate,
      updateNodesGeometry: true,
      updateEdgesGeometry: true
    });
  }
  render(immediate = false) {
    this.scheduler.schedule({
      name: "9.9.render",
      callback: null,
      delay: 0,
      repeat: false,
      synchronized: true,
      immediateUpdates: immediate,
      redraw: true
    });
  }
  _redrawPrepare(destination, isPicking, viewport) {
    let gl = this.gl;
    const fbWidth = destination?.size.width || this.canvasElement.width;
    const fbHeight = destination?.size.height || this.canvasElement.height;
    if (destination == null) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(...this._backgroundColor);
    } else if (isPicking) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
      gl.clearColor(0, 0, 0, 0);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
      if (typeof destination.backgroundColor === "undefined") {
        gl.clearColor(...this._backgroundColor);
      } else {
        gl.clearColor(...destination.backgroundColor);
      }
    }
    if (typeof viewport === "undefined") {
      gl.viewport(0, 0, fbWidth, fbHeight);
    } else {
      gl.viewport(...viewport);
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.depthFunc(gl.LEQUAL);
    this.projectionMatrix = mat4.create();
    this.viewMatrix = mat4.create();
    mat4.perspective(this.projectionMatrix, Math.PI * 2 / 360 * 70, fbWidth / fbHeight, 1, 1e4);
    mat4.identity(this.viewMatrix);
    mat4.translate(this.viewMatrix, this.viewMatrix, [this.panX, this.panY, -this.cameraDistance / this._zoomFactor]);
    mat4.multiply(this.viewMatrix, this.viewMatrix, this.rotationMatrix);
    mat4.translate(this.viewMatrix, this.viewMatrix, this.translatePosition);
  }
  _redrawNodes(destination, isPicking) {
    let gl = this.gl;
    let ext = gl.getExtension("ANGLE_instanced_arrays");
    let currentShaderProgram;
    if (!isPicking) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      if (this.shadedNodes) {
        currentShaderProgram = this.nodesShaderProgram;
      } else {
        currentShaderProgram = this.nodesFastShaderProgram;
      }
    } else {
      gl.disable(gl.BLEND);
      currentShaderProgram = this.nodesPickingShaderProgram;
    }
    currentShaderProgram.use(gl);
    currentShaderProgram.attributes.enable("vertex");
    currentShaderProgram.attributes.enable("position");
    currentShaderProgram.attributes.enable("size");
    currentShaderProgram.attributes.enable("outlineWidth");
    currentShaderProgram.attributes.enable("outlineColor");
    currentShaderProgram.attributes.enable("encodedIndex");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesGeometry.vertexObject);
    gl.vertexAttribPointer(currentShaderProgram.attributes.vertex, 3, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.vertex, 0);
    if (this.nodesGeometry.indexObject) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.nodesGeometry.indexObject);
    }
    gl.uniformMatrix4fv(currentShaderProgram.uniforms.projectionMatrix, false, this.projectionMatrix);
    gl.uniformMatrix4fv(currentShaderProgram.uniforms.viewMatrix, false, this.viewMatrix);
    gl.uniform1f(currentShaderProgram.uniforms.globalOpacity, this._nodesGlobalOpacity);
    let normalMatrix = mat3.create();
    mat3.normalFromMat4(normalMatrix, this.viewMatrix);
    gl.uniformMatrix3fv(currentShaderProgram.uniforms.normalMatrix, false, normalMatrix);
    let colorsArray = this.network.colors;
    let positionsArray = this.network.positions;
    let sizeValue = this.network.sizes;
    let outlineWidthValue = this.network.outlineWidths;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesPositionBuffer);
    gl.enableVertexAttribArray(currentShaderProgram.attributes.position);
    gl.vertexAttribPointer(currentShaderProgram.attributes.position, 3, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.position, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesColorBuffer);
    gl.enableVertexAttribArray(currentShaderProgram.attributes.color);
    gl.vertexAttribPointer(currentShaderProgram.attributes.color, 4, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.color, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesSizeBuffer);
    gl.enableVertexAttribArray(currentShaderProgram.attributes.size);
    gl.vertexAttribPointer(currentShaderProgram.attributes.size, 1, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.size, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesOutlineColorBuffer);
    gl.enableVertexAttribArray(currentShaderProgram.attributes.outlineColor);
    gl.vertexAttribPointer(currentShaderProgram.attributes.outlineColor, 4, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.outlineColor, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesOutlineWidthBuffer);
    gl.enableVertexAttribArray(currentShaderProgram.attributes.outlineWidth);
    gl.vertexAttribPointer(currentShaderProgram.attributes.outlineWidth, 1, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.outlineWidth, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesIndexBuffer);
    gl.enableVertexAttribArray(currentShaderProgram.attributes.encodedIndex);
    gl.vertexAttribPointer(currentShaderProgram.attributes.encodedIndex, 4, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.encodedIndex, 1);
    if (this.nodesGeometry.indexObject) {
      ext.drawElementsInstancedANGLE(gl.TRIANGLES, this.nodesGeometry.numIndices, this.nodesGeometry.indexType, 0, this.network.positions.length / 3);
    } else {
      ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, this.nodesGeometry.numIndices, this.network.positions.length / 3);
    }
    currentShaderProgram.attributes.disable("vertex");
    currentShaderProgram.attributes.disable("position");
    currentShaderProgram.attributes.disable("size");
    currentShaderProgram.attributes.disable("outlineWidth");
    currentShaderProgram.attributes.disable("outlineColor");
    currentShaderProgram.attributes.disable("encodedIndex");
  }
  _redrawEdges(destination, isPicking) {
    let hasEdgeCallbacks = this.onEdgeClickCallback || this.onEdgeHoverMoveCallback || this.onEdgeHoverStartCallback || this.onEdgeHoverEndCallback || this.onEdgeDoubleClickCallback || this.onEdgeClickCallback;
    if (isPicking && (this.fastEdges || !hasEdgeCallbacks)) {
      return;
    }
    let gl = this.gl;
    let ext = gl.getExtension("ANGLE_instanced_arrays");
    let currentShaderProgram;
    if (!isPicking) {
      gl.enable(gl.BLEND);
      if (this.useAdditiveBlending) {
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      } else {
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
      }
      if (this.fastEdges) {
        currentShaderProgram = this.edgesFastShaderProgram;
      } else {
        currentShaderProgram = this.edgesShaderProgram;
      }
    } else {
      gl.disable(gl.BLEND);
      currentShaderProgram = this.edgesPickingShaderProgram;
    }
    if (this.fastEdges) {
      currentShaderProgram.use(gl);
      currentShaderProgram.attributes.enable("vertex");
      currentShaderProgram.attributes.enable("color");
      this.projectionViewMatrix = mat4.create();
      mat4.multiply(this.projectionViewMatrix, this.projectionMatrix, this.viewMatrix);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fastEdgesGeometry.vertexObject);
      gl.vertexAttribPointer(currentShaderProgram.attributes.vertex, 3, gl.FLOAT, false, 0, 0);
      ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.vertex, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.fastEdgesGeometry.colorObject);
      gl.vertexAttribPointer(currentShaderProgram.attributes.color, 4, gl.FLOAT, false, 0, 0);
      ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.color, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.fastEdgesGeometry.indexObject);
      gl.uniformMatrix4fv(currentShaderProgram.uniforms.projectionViewMatrix, false, this.projectionViewMatrix);
      gl.uniform1f(currentShaderProgram.uniforms.globalOpacity, this._edgesGlobalOpacity);
      gl.drawElements(gl.LINES, this.fastEdgesGeometry.numIndices, this.fastEdgesGeometry.indexType, 0);
      currentShaderProgram.attributes.disable("vertex");
      currentShaderProgram.attributes.disable("color");
    } else {
      currentShaderProgram.use(gl);
      currentShaderProgram.attributes.enable("fromVertex");
      currentShaderProgram.attributes.enable("toVertex");
      currentShaderProgram.attributes.enable("vertexType");
      currentShaderProgram.attributes.enable("fromColor");
      currentShaderProgram.attributes.enable("toColor");
      currentShaderProgram.attributes.enable("fromSize");
      currentShaderProgram.attributes.enable("toSize");
      currentShaderProgram.attributes.enable("encodedIndex");
      this.projectionViewMatrix = mat4.create();
      mat4.multiply(this.projectionViewMatrix, this.projectionMatrix, this.viewMatrix);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.edgeVertexTypeBuffer);
      gl.vertexAttribPointer(currentShaderProgram.attributes.vertexType, 2, gl.FLOAT, false, 0, 0);
      ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.vertexType, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.verticesBuffer);
      gl.vertexAttribPointer(currentShaderProgram.attributes.fromVertex, 3, gl.FLOAT, false, 4 * 3 * 2, 0);
      ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.fromVertex, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.verticesBuffer);
      gl.vertexAttribPointer(currentShaderProgram.attributes.toVertex, 3, gl.FLOAT, false, 4 * 3 * 2, 4 * 3);
      ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.toVertex, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.colorBuffer);
      gl.vertexAttribPointer(currentShaderProgram.attributes.fromColor, 4, gl.FLOAT, false, 4 * 4 * 2, 0);
      ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.fromColor, 1);
      gl.vertexAttribPointer(currentShaderProgram.attributes.toColor, 4, gl.FLOAT, false, 4 * 4 * 2, 4 * 4);
      ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.toColor, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.sizeBuffer);
      gl.vertexAttribPointer(currentShaderProgram.attributes.fromSize, 1, gl.FLOAT, false, 4 * 2, 0);
      ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.fromSize, 1);
      gl.vertexAttribPointer(currentShaderProgram.attributes.toSize, 1, gl.FLOAT, false, 4 * 2, 4);
      ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.toSize, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.indexBuffer);
      gl.enableVertexAttribArray(currentShaderProgram.attributes.encodedIndex);
      gl.vertexAttribPointer(currentShaderProgram.attributes.encodedIndex, 4, gl.FLOAT, false, 0, 0);
      ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.encodedIndex, 1);
      gl.uniformMatrix4fv(currentShaderProgram.uniforms.projectionMatrix, false, this.projectionMatrix);
      gl.uniformMatrix4fv(currentShaderProgram.uniforms.viewMatrix, false, this.viewMatrix);
      gl.uniform1f(currentShaderProgram.uniforms.globalOpacity, this._edgesGlobalOpacity);
      gl.uniform1f(currentShaderProgram.uniforms.globalWidthScale, this._globalWidthScale);
      ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, this.edgesGeometry.count);
      currentShaderProgram.attributes.disable("fromVertex");
      currentShaderProgram.attributes.disable("toVertex");
      currentShaderProgram.attributes.disable("vertexType");
      currentShaderProgram.attributes.disable("fromColor");
      currentShaderProgram.attributes.disable("toColor");
      currentShaderProgram.attributes.disable("fromSize");
      currentShaderProgram.attributes.disable("toSize");
      currentShaderProgram.attributes.disable("encodedIndex");
    }
  }
  _redrawAll(destination, isPicking) {
    if (typeof isPicking === "undefined") {
      isPicking = false;
    }
    let gl = this.gl;
    this._redrawPrepare(destination, isPicking);
    gl.depthMask(true);
    if (this._use2D) {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      this._redrawEdges(destination, isPicking);
      this._redrawNodes(destination, isPicking);
    } else {
      gl.enable(gl.DEPTH_TEST);
      this._redrawNodes(destination, isPicking);
      gl.depthMask(false);
      this._redrawEdges(destination, isPicking);
      gl.depthMask(true);
    }
  }
  _updateCenterNodePosition() {
    if (this.centerNode) {
      let pos = this.centerNode.position;
      this.translatePosition[0] = -pos[0];
      this.translatePosition[1] = -pos[1];
      this.translatePosition[2] = -pos[2];
    }
  }
  centerOnNode(nodeID, duration) {
    let node = this.network.nodes[nodeID];
    if (node) {
      this.centerNode = node;
    } else {
      this.centerNode = null;
    }
    if (duration === void 0 || duration == 0) {
      this._updateCenterNodePosition();
      this.update();
      this.render();
    }
  }
  onResize(callback) {
    this.onResizeCallback = callback;
    return this;
  }
  onNodeClick(callback) {
    this.onNodeClickCallback = callback;
    return this;
  }
  onNodeDoubleClick(callback) {
    this.onNodeDoubleClickCallback = callback;
    return this;
  }
  onNodeHoverStart(callback) {
    this.onNodeHoverStartCallback = callback;
    return this;
  }
  onNodeHoverEnd(callback) {
    this.onNodeHoverEndCallback = callback;
    return this;
  }
  onNodeHoverMove(callback) {
    this.onNodeHoverMoveCallback = callback;
    return this;
  }
  onEdgeClick(callback) {
    this.onEdgeClickCallback = callback;
    return this;
  }
  onEdgeDoubleClick(callback) {
    this.onEdgeDoubleClickCallback = callback;
    return this;
  }
  onEdgeHoverStart(callback) {
    this.onEdgeHoverStartCallback = callback;
    return this;
  }
  onEdgeHoverEnd(callback) {
    this.onEdgeHoverEndCallback = callback;
    return this;
  }
  onEdgeHoverMove(callback) {
    this.onEdgeHoverMoveCallback = callback;
    return this;
  }
  onZoom(callback) {
    this.onZoomCallback = callback;
    return this;
  }
  onRotation(callback) {
    this.onRotationCallback = callback;
    return this;
  }
  onLayoutStart(callback) {
    this.onLayoutStartCallback = callback;
    return this;
  }
  onLayoutStop(callback) {
    this.onLayoutStopCallback = callback;
    return this;
  }
  onDraw(callback) {
    this.onDrawCallback = callback;
    return this;
  }
  onReady(callback) {
    if (this.isReady) {
      callback?.(this);
    } else {
      this.onReadyCallback = callback;
    }
  }
  backgroundColor(color2) {
    if (typeof color2 === "undefined") {
      return this._backgroundColor;
    } else {
      this._backgroundColor = color2;
      return this;
    }
  }
  nodeColor(colorInput, nodeID) {
    if (typeof nodeID === "undefined") {
      if (typeof colorInput === "undefined") {
        return this.network.colors;
      } else if (typeof colorInput === "function") {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          let nodeIndex = this.network.ID2index[nodeID2];
          let aColor = colorInput(node, nodeIndex, this.network);
          this.network.colors[nodeIndex * 4 + 0] = aColor[0];
          this.network.colors[nodeIndex * 4 + 1] = aColor[1];
          this.network.colors[nodeIndex * 4 + 2] = aColor[2];
          if (aColor.length > 3) {
            this.network.colors[nodeIndex * 4 + 3] = aColor[3];
          }
        }
      } else if (typeof colorInput === "number") {
        return this.network.colors[this.network.ID2index[colorInput]];
      } else {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          let nodeIndex = this.network.ID2index[nodeID2];
          this.network.colors[nodeIndex * 4 + 0] = colorInput[0];
          this.network.colors[nodeIndex * 4 + 1] = colorInput[1];
          this.network.colors[nodeIndex * 4 + 2] = colorInput[2];
          if (colorInput.length > 3) {
            this.network.colors[nodeIndex * 4 + 3] = colorInput[3];
          }
        }
      }
    } else {
      if (typeof colorInput === "function") {
        let nodeIndex = this.network.ID2index[nodeID];
        let aColor = colorInput(nodeID, nodeIndex, this.network);
        this.network.colors[nodeIndex * 4 + 0] = aColor[0];
        this.network.colors[nodeIndex * 4 + 1] = aColor[1];
        this.network.colors[nodeIndex * 4 + 2] = aColor[2];
        if (aColor.length > 3) {
          this.network.colors[nodeIndex * 4 + 3] = aColor[3];
        }
      } else {
        let nodeIndex = this.network.ID2index[nodeID];
        this.network.colors[nodeIndex * 4 + 0] = colorInput[0];
        this.network.colors[nodeIndex * 4 + 1] = colorInput[1];
        this.network.colors[nodeIndex * 4 + 2] = colorInput[2];
        if (colorInput.length > 3) {
          this.network.colors[nodeIndex * 4 + 3] = colorInput[3];
        }
      }
    }
    return this;
  }
  nodeSize(sizeInput, nodeID) {
    if (typeof nodeID === "undefined") {
      if (typeof sizeInput === "undefined") {
        return this.network.sizes;
      } else if (typeof sizeInput === "function") {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          let aSize = sizeInput(node, this.network);
          this.network.sizes[node.index] = aSize;
        }
      } else {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          this.network.sizes[node.index] = sizeInput;
        }
      }
    } else {
      if (typeof sizeInput === "function") {
        let aSize = sizeInput(nodeID, this.network);
        let nodeIndex = this.network.ID2index[nodeID];
        this.network.sizes[nodeIndex] = aSize;
      } else {
        let nodeIndex = this.network.ID2index[nodeID];
        this.network.sizes[nodeIndex] = sizeInput;
      }
    }
    return this;
  }
  nodeOutlineColor(colorInput, nodeID) {
    if (typeof nodeID === "undefined") {
      if (typeof colorInput === "undefined") {
        return this.network.outlineColors;
      } else if (typeof colorInput === "function") {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          let nodeIndex = this.network.ID2index[nodeID2];
          let aColor = colorInput(node, nodeIndex, this.network);
          this.network.outlineColors[nodeIndex * 4 + 0] = aColor[0];
          this.network.outlineColors[nodeIndex * 4 + 1] = aColor[1];
          this.network.outlineColors[nodeIndex * 4 + 2] = aColor[2];
          if (aColor.length > 3) {
            this.network.outlineColors[nodeIndex * 4 + 3] = aColor[3];
          }
        }
      } else if (typeof colorInput === "number") {
        return this.network.outlineColors[this.network.ID2index[colorInput]];
      } else {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          let nodeIndex = this.network.ID2index[nodeID2];
          this.network.outlineColors[nodeIndex * 4 + 0] = colorInput[0];
          this.network.outlineColors[nodeIndex * 4 + 1] = colorInput[1];
          this.network.outlineColors[nodeIndex * 4 + 2] = colorInput[2];
          if (colorInput.length > 3) {
            this.network.outlineColors[nodeIndex * 4 + 3] = colorInput[3];
          }
        }
      }
    } else {
      if (typeof colorInput === "function") {
        let nodeIndex = this.network.ID2index[nodeID];
        let aColor = colorInput(nodeID, nodeIndex, this.network);
        this.network.outlineColors[nodeIndex * 4 + 0] = aColor[0];
        this.network.outlineColors[nodeIndex * 4 + 1] = aColor[1];
        this.network.outlineColors[nodeIndex * 4 + 2] = aColor[2];
        if (aColor.length > 3) {
          this.network.outlineColors[nodeIndex * 4 + 3] = aColor[3];
        }
      } else {
        let nodeIndex = this.network.ID2index[nodeID];
        this.network.outlineColors[nodeIndex * 4 + 0] = colorInput[0];
        this.network.outlineColors[nodeIndex * 4 + 1] = colorInput[1];
        this.network.outlineColors[nodeIndex * 4 + 2] = colorInput[2];
        if (colorInput.length > 3) {
          this.network.outlineColors[nodeIndex * 4 + 3] = colorInput[3];
        }
      }
    }
    return this;
  }
  nodeOutlineWidth(widthInput, nodeID) {
    if (typeof nodeID === "undefined") {
      if (typeof widthInput === "undefined") {
        return this.network.outlineWidths;
      } else if (typeof widthInput === "function") {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          let aWidth = widthInput(node, this.network);
          this.network.outlineWidths[node.index] = aWidth;
        }
      } else {
        for (const [nodeID2, node] of Object.entries(this.network.nodes)) {
          this.network.outlineWidths[node.index] = widthInput;
        }
      }
    } else {
      if (typeof widthInput === "function") {
        let aWidth = widthInput(nodeID, this.network);
        let nodeIndex = this.network.ID2index[nodeID];
        this.network.outlineWidths[nodeIndex] = aWidth;
      } else {
        let nodeIndex = this.network.ID2index[nodeID];
        this.network.outlineWidths[nodeIndex] = widthInput;
      }
    }
    return this;
  }
  pickPoint(x, y) {
    const fbWidth = this.canvasElement.width * this.pickingResolutionRatio;
    const fbHeight = this.canvasElement.height * this.pickingResolutionRatio;
    const pixelX = Math.round(x * fbWidth / this.canvasElement.clientWidth - 0.5);
    const pixelY = Math.round(fbHeight - y * fbHeight / this.canvasElement.clientHeight - 0.5);
    const data = new Uint8Array(4);
    let gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFramebuffer);
    gl.readPixels(pixelX, pixelY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data);
    const ID = data[0] + (data[1] << 8) + (data[2] << 16) + (data[3] << 24) - 1;
    return ID;
  }
  edgesOpacity(opacity) {
    if (typeof opacity === "undefined") {
      return this._edgesGlobalOpacity;
    } else {
      this._edgesGlobalOpacity = opacity;
      return this;
    }
  }
  edgesWidthScale(scale) {
    if (typeof scale === "undefined") {
      return this._globalWidthScale;
    } else {
      this._globalWidthScale = scale;
      return this;
    }
  }
  nodeOpacity(opacity) {
    if (typeof opacity === "undefined") {
      return this._nodesGlobalOpacity;
    } else {
      this._nodesGlobalOpacity = opacity;
      return this;
    }
  }
  additiveBlending(enableAdditiveBlending) {
    if (typeof enableAdditiveBlending === "undefined") {
      return this.useAdditiveBlending;
    } else {
      this.useAdditiveBlending = enableAdditiveBlending;
      return this;
    }
  }
};
export {
  Helios,
  xnet_exports as xnet
};
//# sourceMappingURL=helios.js.map
