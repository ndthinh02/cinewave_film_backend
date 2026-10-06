import mongoose from 'mongoose';
import MovieCollection from '../models/MovieCollection.js';
import User from '../models/User.js';
import Follow from '../models/Follow.js';
import WatchProgress from '../models/WatchProgress.js';
const validSlug = s => typeof s === 'string' && /^[a-z0-9][a-z0-9-]{0,199}$/.test(s);
export async function requireCollection(req,res,next) {
  if (!mongoose.isObjectIdOrHexString(req.params.collectionId)) return res.status(400).json({message:'Invalid collection'});
  const item=await MovieCollection.findById(req.params.collectionId).lean();
  if (!item || (!item.isPublic && String(item.ownerId)!==req.user?.id)) return res.status(404).json({message:'Collection not found'});
  req.collection=item; next();
}
export function collectionOwner(req,res,next) {
  if (String(req.collection.ownerId)!==req.user.id) return res.status(403).json({message:'Owner only'});
  next();
}
export async function listCollections(req,res) {
  const ownerId=req.params.userId ? new mongoose.Types.ObjectId(req.params.userId).toString() : req.user.id;
  const filter={ownerId,...(ownerId===req.user?.id?{}:{isPublic:true})};
  const {page,limit}=req.reviewPagination;
  const [items,total]=await Promise.all([MovieCollection.find(filter).sort({createdAt:-1,_id:-1}).skip((page-1)*limit).limit(limit).lean(),MovieCollection.countDocuments(filter)]);
  res.set('Cache-Control','no-store').json({items,total,page,hasMore:page*limit<total});
}
function fields(body,create) {
  if (!body || typeof body!=='object') return null;
  const result={};
  if (create || Object.hasOwn(body,'name')) {if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>80)return null;result.name=body.name.trim();}
  if(Object.hasOwn(body,'description')){if(typeof body.description!=='string'||body.description.length>1000)return null;result.description=body.description;}
  if(Object.hasOwn(body,'isPublic')){if(typeof body.isPublic!=='boolean')return null;result.isPublic=body.isPublic;}
  return result;
}
export async function createCollection(req,res){const data=fields(req.body,true);if(!data)return res.status(400).json({message:'Invalid collection fields'});res.status(201).json({item:await MovieCollection.create({...data,ownerId:req.user.id})});}
export function getCollection(req,res){res.set('Cache-Control','no-store').json({item:req.collection});}
export async function editCollection(req,res){const data=fields(req.body,false);if(!data)return res.status(400).json({message:'Invalid collection fields'});res.json({item:await MovieCollection.findOneAndUpdate({_id:req.collection._id,ownerId:req.user.id},{$set:data},{new:true,runValidators:true})});}
export async function deleteCollection(req,res){await MovieCollection.deleteOne({_id:req.collection._id,ownerId:req.user.id});res.json({ok:true});}
export async function collectionMovie(req,res){if(!validSlug(req.params.slug))return res.status(400).json({message:'Invalid movie slug'});const add=req.method==='PUT';const filter={_id:req.collection._id,ownerId:req.user.id};if(add)filter.$or=[{movieSlugs:req.params.slug},{$expr:{$lt:[{$size:'$movieSlugs'},500]}}];const item=await MovieCollection.findOneAndUpdate(filter,add?{$addToSet:{movieSlugs:req.params.slug}}:{$pull:{movieSlugs:req.params.slug}},{new:true});if(!item)return res.status(409).json({message:'Collection limit reached'});res.json({item});}
export async function activityPrivacy(req,res){if(req.method==='PUT'){if(!['private','followers','public'].includes(req.body?.privacy))return res.status(400).json({message:'Invalid privacy'});await User.updateOne({_id:req.user.id},{$set:{watchingPrivacy:req.body.privacy}});}const user=await User.findById(req.user.id).select('watchingPrivacy').lean();res.set('Cache-Control','no-store').json({privacy:user?.watchingPrivacy||'private'});}
export async function activity(req,res){const userId=new mongoose.Types.ObjectId(req.params.userId).toString();const user=await User.findById(userId).select('watchingPrivacy').lean();const privacy=user?.watchingPrivacy||'private';const allowed=req.user?.id===userId||privacy==='public'||(privacy==='followers'&&req.user&&await Follow.exists({followerId:req.user.id,followingId:userId}));const items=allowed?await WatchProgress.find({userId}).sort({lastWatchedAt:-1}).limit(10).select('movieSlug movieName thumbUrl episodeName lastWatchedAt completed -_id').lean():[];res.set('Cache-Control','no-store').json({allowed:!!allowed,items});}
