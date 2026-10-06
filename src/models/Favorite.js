import mongoose from 'mongoose';
const schema=new mongoose.Schema({userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',index:true,required:true},movieSlug:{type:String,index:true,required:true},name:String,thumbUrl:String,posterUrl:String,year:Number},{timestamps:true});
schema.index({userId:1,movieSlug:1},{unique:true});
export default mongoose.model('Favorite',schema);
