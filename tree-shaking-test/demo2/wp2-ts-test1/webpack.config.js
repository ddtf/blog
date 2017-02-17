const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
module.exports ={
	context: __dirname,
	entry:{
		index: './src/entry.js'
	},

	output:{
		path: path.resolve(__dirname, './dist'),
		filename:'[name].js'
	},
	plugins:[
			new webpack.DefinePlugin({
	            'process.env': {
	              'NODE_ENV': `"production"`,
	              'BUILD_ENV': '"online"'
	            }
	        }),
	        new webpack.LoaderOptionsPlugin({
				minimize: true
			}),
	        new webpack.optimize.UglifyJsPlugin({
	             compress: {
	                unused: true,    // Enables tree shaking
	                dead_code: true, // Enables tree shaking
	                pure_getters: true,
	                warnings: false,
	                screw_ie8: true,
	                conditionals: true,
	                comparisons: true,
	                sequences: true,
	                evaluate: true,
	                join_vars: true,
	                if_return: true,
	            },
	            output: {
	                comments: false
	            },
	        })
	]
}