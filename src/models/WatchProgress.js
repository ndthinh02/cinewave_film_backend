import mongoose from 'mongoose';
const schema=new mongoose.Schema({userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',index:true,required:true},movieSlug:{type:String,index:true,required:true},movieName:String,thumbUrl:String,episodeName:String,episodeSlug:String,positionSeconds:{type:Number,default:0},durationSeconds:{type:Number,default:0},completed:{type:Boolean,default:false},lastWatchedAt:{type:Date,default:Date.now}},{timestamps:true});
schema.index({userId:1,movieSlug:1},{unique:true});
export default mongoose.model('WatchProgress',schema);
