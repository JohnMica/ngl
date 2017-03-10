/**
 * @file Dsn6 Parser
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @private
 */


import { Matrix4 } from "../../lib/three.es6.js";

import { Debug, Log, ParserRegistry } from "../globals.js";
import { degToRad } from "../math/math-utils.js";
import VolumeParser from "./volume-parser.js";


function Dsn6Parser( streamer, params ){

    VolumeParser.call( this, streamer, params );

}

Dsn6Parser.prototype = Object.assign( Object.create(

    VolumeParser.prototype ), {

    constructor: Dsn6Parser,
    type: "dsn6",

    _parse: function(){

        // http://www.uoxray.uoregon.edu/tnt/manual/node104.html

        if( Debug ) Log.time( "Dsn6Parser._parse " + this.name );

        var bin = this.streamer.data;

        if( bin instanceof Uint8Array ){
            bin = bin.buffer;
        }

        var v = this.volume;
        var header = {};

        var intView = new Int16Array( bin );
        var byteView = new Uint8Array( bin );

        // swap byte order when big endian
        if( intView[ 18 ] !== 100 ){
            for( let i = 0, n = intView.length; i < n; ++i ){
                const val = intView[ i ];
                intView[ i ] = ( ( val & 0xff ) << 8 ) | ( ( val >> 8 ) & 0xff );
            }
        }

        header.xStart = intView[ 0 ];  // NXSTART
        header.yStart = intView[ 1 ];
        header.zStart = intView[ 2 ];

        header.xExtent = intView[ 3 ];  // NX
        header.yExtent = intView[ 4 ];
        header.zExtent = intView[ 5 ];

        header.xRate = intView[ 6 ];  // MX
        header.yRate = intView[ 7 ];
        header.zRate = intView[ 8 ];

        var factor = 1 / intView[ 17 ];
        var scalingFactor = factor * this.voxelSize;

        header.xlen = intView[ 9 ] * scalingFactor;
        header.ylen = intView[ 10 ] * scalingFactor;
        header.zlen = intView[ 11 ] * scalingFactor;

        header.alpha = intView[ 12 ] * factor;
        header.beta  = intView[ 13 ] * factor;
        header.gamma = intView[ 14 ] * factor;

        v.header = header;

        // Log.log( header );

        var data = new Float32Array(
            header.xExtent * header.yExtent * header.zExtent
        );

        var divisor = intView[ 15 ] / 100;
        var summand = intView[ 16 ];

        var offset = 512;
        var xBlocks = Math.ceil( header.xExtent / 8 );
        var yBlocks = Math.ceil( header.yExtent / 8 );
        var zBlocks = Math.ceil( header.zExtent / 8 );

        // loop over blocks
        for( var zz = 0; zz < zBlocks; ++zz ){
            for( var yy = 0; yy < yBlocks; ++yy ){
                for( var xx = 0; xx < xBlocks; ++xx ){

                    // loop inside block
                    for( var k = 0; k < 8; ++k ){
                        var z = 8 * zz + k;
                        for( var j = 0; j < 8; ++j ){
                            var y = 8 * yy + j;
                            for( var i = 0; i < 8; ++i ){
                                var x = 8 * xx + i;

                                // check if remaining slice-part contains data
                                if( x < header.xExtent && y < header.yExtent && z < header.zExtent ){
                                    var idx = ( ( ( ( x * header.yExtent ) + y ) * header.zExtent ) + z );
                                    data[ idx ] = ( byteView[ offset ] - summand ) / divisor;
                                    ++offset;
                                }else{
                                    offset += 8 - i;
                                    break;
                                }

                            }
                        }
                    }

                }
            }
        }

        v.setData( data, header.zExtent, header.yExtent, header.xExtent );

        if( Debug ) Log.timeEnd( "Dsn6Parser._parse " + this.name );

    },

    getMatrix: function(){

        var h = this.volume.header;

        var basisX = [
            h.xlen,
            0,
            0
        ];

        var basisY = [
            h.ylen * Math.cos( Math.PI / 180.0 * h.gamma ),
            h.ylen * Math.sin( Math.PI / 180.0 * h.gamma ),
            0
        ];

        var basisZ = [
            h.zlen * Math.cos( Math.PI / 180.0 * h.beta ),
            h.zlen * (
                    Math.cos( Math.PI / 180.0 * h.alpha ) -
                    Math.cos( Math.PI / 180.0 * h.gamma ) *
                    Math.cos( Math.PI / 180.0 * h.beta )
                ) / Math.sin( Math.PI / 180.0 * h.gamma ),
            0
        ];
        basisZ[ 2 ] = Math.sqrt(
            h.zlen * h.zlen * Math.sin( Math.PI / 180.0 * h.beta ) *
            Math.sin( Math.PI / 180.0 * h.beta ) - basisZ[ 1 ] * basisZ[ 1 ]
        );

        var basis = [ 0, basisX, basisY, basisZ ];
        var nxyz = [ 0, h.xRate, h.yRate, h.zRate ];
        var mapcrs = [ 0, 1, 2, 3 ];

        var matrix = new Matrix4();

        matrix.set(

            basis[ mapcrs[1] ][0] / nxyz[ mapcrs[1] ],
            basis[ mapcrs[2] ][0] / nxyz[ mapcrs[2] ],
            basis[ mapcrs[3] ][0] / nxyz[ mapcrs[3] ],
            0,

            basis[ mapcrs[1] ][1] / nxyz[ mapcrs[1] ],
            basis[ mapcrs[2] ][1] / nxyz[ mapcrs[2] ],
            basis[ mapcrs[3] ][1] / nxyz[ mapcrs[3] ],
            0,

            basis[ mapcrs[1] ][2] / nxyz[ mapcrs[1] ],
            basis[ mapcrs[2] ][2] / nxyz[ mapcrs[2] ],
            basis[ mapcrs[3] ][2] / nxyz[ mapcrs[3] ],
            0,

            0, 0, 0, 1

        );

        matrix.multiply(
            new Matrix4().makeRotationY( degToRad( 90 ) )
        );

        matrix.multiply( new Matrix4().makeTranslation(
            -h.zStart, h.yStart, h.xStart
        ) );

        matrix.multiply( new Matrix4().makeScale(
            -1, 1, 1
        ) );

        return matrix;

    }

} );

ParserRegistry.add( "dsn6", Dsn6Parser );


export default Dsn6Parser;