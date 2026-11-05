import type { QcDailyPlan, QcDailyMaterial } from './qcDailyPlanSource'

/** Master Activity stores ingredient recipes; QC must record the commercial product
 * selected by the operator. Never guess a brand when several ACTIVE products match.
 */
export type FertilizerMasterProduct={
  materialName:string
  activeIngredient:string
  unit:string
  category:string
  active:boolean
}
export type FertilizerChoice={
  name:string
  ingredient:string
  dosePerHa:number
  unit:string
  commercial:boolean
}
const txt=(value:unknown)=>String(value??'').trim()
export function fertilizerIngredientKey(value:unknown){
  return txt(value).normalize('NFKC').toLocaleLowerCase('id-ID').replace(/[^a-z0-9]/g,'')
}
function fertilizerUnitKey(value:unknown){
  return txt(value).toLocaleUpperCase('id-ID').replace(/\s+/g,'').replace(/\/HA$|PERHA$/,'').replace(/KILOGRAM/g,'KG').replace(/LITER/g,'L')
}
export function fertilizerChoices(
  plan:Pick<QcDailyPlan,'materials'>|null|undefined,
  productMaster:readonly FertilizerMasterProduct[],
  productListLoaded:boolean,
):FertilizerChoice[]{
  if(!plan)return []
  const options:FertilizerChoice[]=[]
  const seen=new Set<string>()
  for(const component of plan.materials){
    const ingredientKey=fertilizerIngredientKey(component.material)
    if(!ingredientKey)continue
    const componentUnit=fertilizerUnitKey(component.doseUnit||component.unit)
    const products=productListLoaded?productMaster.filter(product=>{
      return product.active&&txt(product.materialName)
        &&fertilizerIngredientKey(product.activeIngredient)===ingredientKey
        &&(!componentUnit||!fertilizerUnitKey(product.unit)||fertilizerUnitKey(product.unit)===componentUnit)
        &&(!txt(product.category)||/FERTILI|PUPUK/i.test(product.category))
    }):[]
    if(!productListLoaded)continue
    const choices=products.length?products.map(item=>({name:txt(item.materialName),commercial:true})):
      [{name:component.material,commercial:false}]
    for(const item of choices){
      const key=fertilizerIngredientKey(item.name)
      if(!key||seen.has(key))continue
      seen.add(key)
      options.push({
        name:item.name,ingredient:component.material,
        dosePerHa:component.dosePerHa,unit:component.doseUnit||component.unit,
        commercial:item.commercial,
      })
    }
  }
  return options
}
/** Only auto-select unambiguous brands. If more than one brand matches, require
 * a deliberate operator selection instead of assigning an arbitrary product.
 */
export function suggestedFertilizerName(
  component:QcDailyMaterial|undefined,
  choices:readonly FertilizerChoice[],
  productListLoaded:boolean,
):string{
  if(!component||!productListLoaded)return''
  const matched=choices.filter(option=>fertilizerIngredientKey(option.ingredient)===fertilizerIngredientKey(component.material))
  return matched.length===1?matched[0].name:''
}
export function fertilizerChoiceByName(value:string,choices:readonly FertilizerChoice[]){
  return choices.find(choice=>fertilizerIngredientKey(choice.name)===fertilizerIngredientKey(value))
}
