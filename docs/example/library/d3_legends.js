// Copyright 2019–2020 Observable, Inc.

// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.

// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
// ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
// ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
// OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

// Modifications by @filipinascimento to work as a standalone package

import * as d3 from "d3";

function Legend(color, {
	title,
	titleAlignment = "start",
	svg = null,
	tickSize = 6,
	orientation = "horizontal",
	width = orientation == "horizontal" ? 220 : 44 + tickSize,
	height = orientation == "horizontal" ? 44 + tickSize : 220,
	marginTop = orientation == "horizontal" ? 18 : 0,
	marginRight = orientation == "horizontal" ? 0 : 16 + tickSize,
	marginBottom = orientation == "horizontal" ? 16 + tickSize : 0,
	marginLeft = orientation == "horizontal" ? 0 : 18,
	ticks = orientation == "horizontal" ? width / 64 : height / 64,
	tickFormat,
	tickValues,
	// themeColors = ["white","black"],
	themeColors = ["black", "white"],

} = {}) {

	function rampHorizontal(color, n = 256) {
		const canvas = document.createElement("canvas");
		canvas.width = n;
		canvas.height = 1;
		const context = canvas.getContext("2d");
		for (let i = 0; i < n; ++i) {
			context.fillStyle = color(i / (n - 1));
			context.fillRect(i, 0, 1, 1);
		}
		return canvas;
	}

	function rampVertical(color, n = 256) {
		const canvas = document.createElement("canvas");
		canvas.width = 1;
		canvas.height = n;
		const context = canvas.getContext("2d");
		for (let i = 0; i < n; ++i) {
			context.fillStyle = color(i / (n - 1));
			context.fillRect(0, n - i-1, 1, 1);
		}
		return canvas;
	}

	if (orientation != "horizontal" && orientation != "vertical") {
		// raise error
		console.error("orientation must be 'horizontal' or 'vertical'");
		return;
	}

	let tickAdjustHorizontal = g => g.selectAll(".tick line").attr("y1", marginTop + marginBottom - height - 1);
	let tickAdjustVertical = g => g.selectAll(".tick line").attr("x1", marginLeft - width + marginRight);
	let ramp = orientation == "horizontal" ? rampHorizontal : rampVertical;
	let tickAdjust = orientation == "horizontal" ? tickAdjustHorizontal : tickAdjustVertical;

	if (!svg) {
		svg = d3.create("svg")
			.attr("width", width)
			.attr("height", height)
			.attr("viewBox", [0, 0, width, height])
			.style("overflow", "visible")
			.style("display", "block");
	} else {
		svg
			.attr("width", width)
			.attr("height", height)
			// .attr("viewBox", [0, 0, width, height])
			.style("overflow", "visible")
		// .style("display", "block");
	}

	let x;

	svg.append("rect")
		.attr("x", marginLeft)
		.attr("y", marginTop)
		.attr("width", width - marginLeft - marginRight)
		.attr("height", height - marginTop - marginBottom)
		.attr("fill", themeColors[1])
		.attr("stroke", themeColors[1])
		.attr("stroke-width", 4);

	svg.append("rect")
		.attr("x", marginLeft)
		.attr("y", marginTop)
		.attr("width", width - marginLeft - marginRight)
		.attr("height", height - marginTop - marginBottom)
		.attr("fill", themeColors[0])
		.attr("stroke", themeColors[0])
		.attr("stroke-width", 2);

	// Continuous
	if (color.interpolate) {
		const n = Math.min(color.domain().length, color.range().length);
		if (orientation == "horizontal") {
			x = color.copy().rangeRound(d3.quantize(d3.interpolate(marginLeft, width - marginRight), n));
		} else {
			x = color.copy().rangeRound(d3.quantize(d3.interpolate(height - marginBottom,marginTop), n));
		}

		svg.append("image")
			.attr("x", marginLeft)
			.attr("y", marginTop)
			.attr("width", width - marginLeft - marginRight)
			.attr("height", height - marginTop - marginBottom)
			.attr("preserveAspectRatio", "none")
			.attr("xlink:href", ramp(color.copy().domain(d3.quantize(d3.interpolate(0, 1), n))).toDataURL());
	}

	// Sequential
	else if (color.interpolator) {
		if (orientation == "horizontal") {
			x = Object.assign(color.copy()
				.interpolator(d3.interpolateRound(marginLeft, width - marginRight)),
				{ range() { return [marginLeft, width - marginRight]; } });
		} else {
			x = Object.assign(color.copy()
				.interpolator(d3.interpolateRound(height - marginBottom,marginTop)),
				{ range() { return [height - marginBottom,marginTop]; } });
		}

		svg.append("image")
			.attr("x", marginLeft)
			.attr("y", marginTop)
			.attr("width", width - marginLeft - marginRight)
			.attr("height", height - marginTop - marginBottom)
			.attr("preserveAspectRatio", "none")
			.attr("xlink:href", ramp(color.interpolator()).toDataURL());

		// scaleSequentialQuantile doesn’t implement ticks or tickFormat.
		if (!x.ticks) {
			if (tickValues === undefined) {
				const n = Math.round(ticks + 1);
				tickValues = d3.range(n).map(i => d3.quantile(color.domain(), i / (n - 1)));
			}
			if (typeof tickFormat !== "function") {
				tickFormat = d3.format(tickFormat === undefined ? ",f" : tickFormat);
			}
		}
	}

	// Threshold
	else if (color.invertExtent) {
		const thresholds
			= color.thresholds ? color.thresholds() // scaleQuantize
				: color.quantiles ? color.quantiles() // scaleQuantile
					: color.domain(); // scaleThreshold

		const thresholdFormat
			= tickFormat === undefined ? d => d
				: typeof tickFormat === "string" ? d3.format(tickFormat)
					: tickFormat;

		if (orientation == "horizontal") {
			x = d3.scaleLinear()
				.domain([-1, color.range().length - 1])
				.rangeRound([marginLeft, width - marginRight]);
		} else {
			x = d3.scaleLinear()
				.domain([-1, color.range().length - 1])
				.rangeRound([height - marginBottom,marginTop]);
		}

		if (orientation == "horizontal") {
			svg.append("g")
				.selectAll("rect")
				.data(color.range())
				.join("rect")
				.attr("x", (d, i) => x(i - 1))
				.attr("y", marginTop)
				.attr("width", (d, i) => x(i) - x(i - 1))
				.attr("height", height - marginTop - marginBottom)
				.attr("fill", d => d);
		} else {
			svg.append("g")
				.selectAll("rect")
				.data(color.range())
				.join("rect")
				.attr("x", marginLeft)
				.attr("y", (d, i) => x(i - 1))
				.attr("width", width - marginLeft - marginRight)
				.attr("height", (d, i) => x(i) - x(i - 1))
				.attr("fill", d => d);
		}


		tickValues = d3.range(thresholds.length);
		tickFormat = i => thresholdFormat(thresholds[i], i);
	}

	// Ordinal
	else {
		if (orientation == "horizontal") {
			x = d3.scaleBand()
				.domain(color.domain())
				.rangeRound([marginLeft, width - marginRight]);
		} else {
			x = d3.scaleBand()
				.domain(color.domain())
				.rangeRound([marginTop, height - marginBottom]);
		}

		if (orientation == "horizontal") {
			svg.append("g")
				.selectAll("rect")
				.data(color.domain())
				.join("rect")
				.attr("x", x)
				.attr("y", marginTop)
				.attr("width", Math.max(0, x.bandwidth() - 1))
				.attr("height", height - marginTop - marginBottom)
				.attr("fill", color);
		} else {
			svg.append("g")
				.selectAll("rect")
				.data(color.domain())
				.join("rect")
				.attr("x", marginLeft)
				.attr("y", x)
				.attr("width", width - marginLeft - marginRight)
				.attr("height", Math.max(0, x.bandwidth() - 1))
				.attr("fill", color);
		}


		tickAdjust = () => { };
	}
	//append white rect stroke around the colorbar


	if (orientation == "horizontal") {
		svg.append("g")
			.attr("transform", `translate(0,${height - marginBottom})`)
			.call(d3.axisBottom(x)
				.ticks(ticks, typeof tickFormat === "string" ? tickFormat : undefined)
				.tickFormat(typeof tickFormat === "function" ? tickFormat : undefined)
				.tickSize(tickSize)
				.tickValues(tickValues))
			// .attr("paint-order", "stroke")
			.attr("stroke-linecap", "round")
			.attr("stroke-linejoin", "round")
			.attr("stroke-dasharray", "0%")
			.attr("stroke-dashoffset", 0)
			.attr("stroke", themeColors[1])
			.attr("stroke-width", 2.5)
			.attr("fill", themeColors[1])
			.call(tickAdjust)
			.call(g => {
				g.selectAll(".tick").select("line")
					.attr("stroke-width", 3)
					.attr("stroke", themeColors[1]).clone()
					.attr("stroke-width", 1.5)
					.attr("stroke", themeColors[0])

				g.selectAll("text")
					.attr("stroke", themeColors[1])
					.clone(true)
						.attr("fill", themeColors[0])
						.attr("stroke", "none");

			})
			.call(g => g.select(".domain").remove())
			.call(g => {
				g.append("text")
					.attr("x", titleAlignment == "start" ? marginLeft : width - marginRight)
					.attr("y", marginTop + marginBottom - height - 6)
					.attr("stroke", themeColors[1])
					.attr("text-anchor", titleAlignment)
					.attr("font-weight", "bold")
					.attr("class", "title")
					.attr("font-size", "14px")
					.attr("stroke-width", 3)
					.text(title).clone(true)
					.attr("stroke", "none")
					.attr("fill", themeColors[0]);
			});
	} else {
		
		svg.append("g")
			.attr("transform", `translate(${width - marginRight},0)`)
			.call(d3.axisRight(x)
				.ticks(ticks, typeof tickFormat === "string" ? tickFormat : undefined)
				.tickFormat(typeof tickFormat === "function" ? tickFormat : undefined)
				.tickSize(tickSize)
				.tickValues(tickValues))
			// .attr("paint-order", "stroke")
			.attr("stroke-linecap", "round")
			.attr("stroke-linejoin", "round")
			.attr("stroke-dasharray", "0%")
			.attr("stroke-dashoffset", 0)
			.attr("stroke", themeColors[1])
			.attr("stroke-width", 2.5)
			.attr("fill", themeColors[1])
			.call(tickAdjust)
			.call(g => {
				g.selectAll(".tick").select("line")
					.attr("stroke-width", 3)
					.attr("stroke", themeColors[1]).clone()
					.attr("stroke-width", 1.5)
					.attr("stroke", themeColors[0])

				
				g.selectAll("text")
				.attr("stroke", themeColors[1])
				.clone(true)
					.attr("fill", themeColors[0])
					.attr("stroke", "none");

			}
			)
			.call(g => g.select(".domain").remove())
			.call(g => {
				g.append("text")
					.attr("x", marginTop + marginBottom - height+1)
					.attr("y", -marginLeft)
					.attr("fill", themeColors[0])
					.attr("stroke", themeColors[1])
					.attr("text-anchor", titleAlignment)
					.attr("font-weight", "bold")
					.attr("class", "title")
					.attr("font-size", "14px")
					.attr("stroke-width", 3)
					//rotate the text by 90 degrees
					.attr("transform", "rotate(-90)")
					.text(title).clone(true)
					.attr("stroke", "none")
					.attr("fill", themeColors[0]);
					
				
			}
			);

	}

	return svg.node();
}

export default Legend;
