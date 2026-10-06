import mongoose from 'mongoose';
const schema = new mongoose.Schema({ownerId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},name:{type:String,required:true,maxlength:80},description:{type:String,default:'',maxlength:1000},isPublic:{type:Boolean,default:false},movieSlugs:{type:[String],default:[]}}, {timestamps:true});
schema.index({ownerId:1,isPublic:1,createdAt:-1});
export default mongoose.model('MovieCollection',schema);
