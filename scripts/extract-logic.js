// Extrait la logique pure (données + calculs) de web/app.html pour la tester sous Node.
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.html'), 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const logic = js.split('/*LOGIC_START*/')[1].split('/*LOGIC_END*/')[0];
const exportsList = 'AISLES,STORES,ING,R,DEF_S,clone,newState,portions,allowed,estPrice,priceAt,buildLines,sum,curLines,pickMenu,regen,fitMeals,swapOptions,swapOne,haveIt,validateWeek,startNewWeek,listText,planIds,totalAt,priciest,weekKey,fq,fe,qStep,stepTxt,stepMins,applyCustom,mkRec,findIng,norm,takeQty,parseIngLine,parseRecipeInput,buildDraft,draftToRecipe,saveCustom,deleteCustom,draftFromRecipe,recompute,groupOf,minutesFrom,ALLERGENS,DISLIKABLE,BASE_R,recOf,bestVar,fits,baseId,migrateIds,VARS,ALIAS,VMAP';
fs.writeFileSync(path.join(__dirname, '..', 'test', '.logic.cjs'),
  logic + '\nmodule.exports={' + exportsList + ',setComm:c=>{COMM=c;}};\n');
