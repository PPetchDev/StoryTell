/**
 * Words and three-word phrases that language models overuse against human writing, from
 * sam-paech/slop-score (https://github.com/sam-paech/slop-score), `data/slop_list.json` and
 * `data/slop_list_trigrams.json` at commit 289264ab2a0df1358ef81ced3c259610ea709514, fetched
 * 2026-11-23. Lower-cased, sorted and with repeats taken out; otherwise as published. MIT License,
 * Copyright (c) 2025 Sam Paech: the notice is in slop-lists.NOTICE.md beside this file.
 *
 * A phrase is three content words in a row with the common words between them left out, so
 * "took a deep breath" is listed as "took deep breath".
 */

/** Single words. */
export const OVERUSED_WORDS: ReadonlySet<string> = new Set(
    `
absenteeism absently abuzz accelerant accentuates accor ached acrid actionable actualization adaptability adaptable adeptly adherence adira 
advancements aedan aelara aeldrin aeliana aelion aelius aella aeloria aelric aelwyn aerion aeternum aeternus aethel aethelburg aethelgard aethelred 
aethera aethereia aetheria aetherians aetherium aetherius aethers aethon agonizing agonizingly agreeableness akinator alara alaric alayna aldric 
aldwyn aleron algorithmic alienating align aligning aligns alleviates alleyway allfather amara amelia americanization amid amplified amplifies 
amplify amplifying animatedly anomie anxieties anya arcane arcanus arced archdemon archmage arcturian aric arin aris armrest armrests artificiality 
ashen ashwood asmodeus aspirational astrobiologist astutely asymmetries atheria audible audits aurors averting azathoth azazel azrael ballooned 
barked baruk bated beckoned bedrock beeped behaviorists behaviors belied bellowed bellweather beneficence bewildered bewilderment biases bicultural 
billowed billowing bioluminescent biometric blackwood blackwoods blankly blared bleez blending blinding blinked bloomed blueprinting blurring blurted 
bolstered bolstering bolsters boomed borderless borin bottlenecks bridging brindlemark broadens broader brow brushstroke burdening burdens burgeoning 
bustled bustling buzzed cackled cacophony caelan caelum calloused calvinball cartographer cascaded cautiously cavernous cawed cementing centricity 
cerebus challenges characterized chattered chestplate chillingly chimed chirped chitinous choz chronal chronarium chronos chuckled cityscape clacked 
clang clanged clasped classism clatter clattered clattering clawed clawing clenched clich clinked clinking cloaked clockmaker cloying clung clutched 
clutching cluttered coalesced coalescing cobblestone cobblestones codifying coeducational cohesion coiling collaboratively collectivist commlink 
commodification commodified commoditization communicative competencies complemented complementing complexities complicating conclusion conducive 
confluence congruence conscientiousness conspiratorial conspiratorially constructionism constructivist contexts contextualize contextualized 
contextualizing contextually contorted contorting conversely cornerstone correlating correlational counterarguments countering countertransference 
coursed coursing crackle crackled crackling cradled cradling creak creaked creaking crept crescendoed crimson crinkled crinkling critiqued critiquing 
croaked crookedly crouched crucial crucially crucio crumbling crumpled crumpling cultists cultivate cultivates cultivating curbing curricula daedra 
daedric dampeners dampness daoism dappling darkwood darted darting datapad deafening debriefing decentralizing deceptively deconstruct deconstructs 
deductibility defied dehumanization delineate delineates delineating deliverables delve delved delves delving democratize democratized democratizes 
democratizing demonstrable demonstrably demystifies demystify deontological desolate destructo determinant determinants deterring deviance devourer 
differentiator digitalization dilemmas diluting diminish dimly dimmed dimness disbelief disconcertingly disconnection discordant disengagement 
disheveled dismantles dismissively disorganization disorientation disoriented disorienting disparities dispossession disruptions disruptors disrupts 
dissecting dissects distills divergences diversification diversifies diversifying dizzying doomguy doorframe doppelg dovahkiin downturns dragonborn 
drakon drawled dread droned drumbeat dursleys dynamism dysregulation eadric eamon echoed echoes echoing eerie eerily einherjar eira elara eldarion 
elderglen eldergrove eldermere elderton eldoria eldrath eldric eldrid eldrin eldrion eldritch eldrith elevates elian eliana elias elion eliora elira 
ellaria elliana elmsworth elongating elowen elros elucidates elucidating elyas elyndor elyndra elyon elyra elys elysia elysion elysium emanate 
emanated embed embedding embodies embodying empathetic emphasizes emphasizing empowers encapsulate encapsulates encapsulating enchantments encompass 
encompasses encompassing encourages encroaching endures enduring enforceability engenders enhance enhances enhancing enigmatic enriches enslavers 
ensures ensuring entails entrenching enveloped eolan eolande eons epitomize epitomized epitomizes equipping equips equitable eremon eridan eridani 
erode erodes eroding erupted eryndor etched ethan ethereal ethical ethically evelyn evidenced evoking evolve evolves evolving exacerbate exacerbated 
exacerbates exacerbating exacts exceeding exclaimed exemplified exemplifies exemplify exemplifying exhilaration exigencies expanse expatriate 
experiential explores externalities facepalmed faceted facilitating faded faint faintly faltered falters festered fianc fidgeted finnian finnigan 
firelight fishtailed fleeting flicker flickered flickering flinched flitted floorboards fluffernutter fluttered foregrounding foregrounds fortifies 
fortifying fostered fostering fosters foundational fourthly fragmented frameworks franchising frantic fraught frayed fraying frictions frizzle 
frowned froze fueled functionalities fundamentally furrowed furrowing furthermore gamification gamified gaped gaslights gasped gauntleted gaze gazed 
gazes generalizability generalizable geopolitical geralt gerta gestured gesturing glanced glances glancing glar glared gleamed gleaming gleep glided 
glimmer glimmered glimmering glint glinted glinting glistened glistening globalization globalized gloved glow glowed glyphs gnarled gnawed gnawing 
godric gorok gorthok grapple grappled grapples grath gravelly greatsword greenwashing gregnok grimbold grimgold grimly grimoire grimoires grimstone 
grinned gripped grizzled groaned grogg groggily grognak grok grolak groundwork groupthink growl growled gruff grumbled grunted gruuz guildmaster 
guildmates gurgled guttered guttural hampers hargrove havenwood heartstone hefted hefting heightens hesitantly hesitated heterogeneity hierarchies 
highlighting hilt hinder hindering hinges hissed hitched hivemind hoarse holistic holistically hollowly holographic holstered homelander homelessness 
homogenization hovered howled huddled hues huginn hulking humanized humanizes humanizing hummed humming humorless hunched hurdles hurried hurtled 
hushed ichor ignarion ignis igniting illuminates illustrating imbue imbues imbuing immense impactful impacting impairing impairs impassive 
imperatives imperceptible impermanence implications impossibly impulsivity inadequacy incantation incantations incapacitation incentivize 
incentivized incentivizes incentivizing inclusivity indefinably indelible indispensable inefficiencies inequalities inequities inextricably 
inferential infrastructural infuses ingrained inherent inherently initiatives injectable inky innocuously innovate insectoid insidiously insights 
insistent instinctively institutionalize institutionalizing instrumentality integrates integrating integrations intently interconnected 
interconnectedness interconnections intercultural interdependence interdependencies interdimensional intergroup interjected internalize internalizing 
interplay interpretative interprofessional interrelated interrogates intersectionality intersects intertwined intertwines intertwining interventions 
intoned intricacies intricate intricately intrinsically iridescent ironforge irrevocably isher isolde itched iterate iterative iteratively jagged 
jarek jaxon jingled jolt jolted joren journaling judicious judiciously juxtaposes juxtaposing k'tharr kael kaela kaelan kaelen kaelin kaelor kaelthar 
kaida kaito kal'ren kaleidoscope kalel kessari keth kethra keycard knelt krael kraelion kragoth krel krixon kryll labyrinthine laced lamplight lanced 
lapses leaned learners leverages leveraging lifeblood lifecycle lila linchpin lingered liora lira lirael liran lirien lirin locket lockpick 
lockpicking lockpicks logistical loomed lorian lumin lumina luminara luminari luminescence luminescent lunged lurched lurked luster lyra lyrien 
lysander lysandra lysara mages malachai malachar malachor maladaptive malakai malakar malakor malazar maleficence malevolence malevolent malkor 
malphas malric maltreatment malus mandating mandibles manifests marginalization marginalized marginalizing marveled marveling masterclass masterfully 
masterstroke materialized materializing maximization meadowgrove meaningfully measurable medbay megacorps mentorship meowed merfolk meritocratic 
methodological methodologies meticulous meticulously meticulousness metrics microsystem microsystems miggins mingling minimizes minimizing mirroring 
mirthless misaligned misalignment misalignments misbehavior miscommunications misinterpretations mismatches missingno misunderstandings mitigate 
mitigates mitigating monolithic moreover moros morwen motes mournful mttr muffled muggle multifaceted multifactorial multilingualism multipronged 
mumbled murmur murmured murmurs mused mutely muttered narratives narrowed narrowing nascent navigate navigated navigates navigating necessitate 
necessitates necessitating necromancer necromantic nestled neurobiological neurodevelopmental neuroplasticity newfound nightshade nocked nodded 
normalizes nuanced nuances numbah numbly nurtures nuzzled oakhaven oblivious obscures obsidian obsolescence oelia oligopolistic oligopoly ominously 
omnicorp onboarding operant operationalize operationalized optimize optimizes optimizing orcish organizational ostracization otherworldly outcomes 
outmaneuver outmatched outpacing outperforming outthink overarching overburdened overemphasis overextension overreach overreliance oversights 
oversimplification oversimplifies oversimplify overstated paled palpable pandemic pang panted paradigm paradigms paradoxical paradoxically paramount 
participative pattered paused pedagogical peephole peered penhaligon perceives performative perils perked permeates permeating perpetually 
perpetuates perpetuating perpetuation persist personalization personalized pertains pervasive pervasiveness petrova phonology pinpricks pipkin piqued 
pivotal pivoted pivots pixelated placating planchette plasteel poignantly policymakers pored poring positing positivist posits pounding powerfully 
practicalities precariously precariousness precipice predicated predispositions preempt preventative prickle prickled prickling prioritization 
prioritize prioritized prioritizes prioritizing proactive proactively profitability profound profoundly proliferates pronged pronouncements propels 
protectionist protectiveness psychosocial pulsated pulsating pulsed pulsing punctuated purred pyrokinetic quaked qualitative quantifiable quickened 
quickening quicksave quietude quintessential quirked quivered raced radiating raged railguns randomization rasp rasped rasping raspy reallocating 
reallocation recalibrate recalibration recessions recognizing recoiled recoiling reconstructs redefines reeked reeled reeling reengineering 
reevaluating reevaluation refine refines reflexivity reframe reframes reframing reimagining reinforces reinforcing relational relentless reliant renn 
reorientation reputational reshaped reshaping resilience resilient resonant resonate resonated resonates resonating resourced responsiveness 
restatement reticuli retrieved reveled reverberate reverberated reverberating reverie revolutionized revolutionizing rhythmic rigor rigorous rippled 
rippling rivaling rivia rngus roared robust romanticized roomba rooted rostova rumbled rumbling rummaged runes rusted rustle rustled rustling ryker 
ryla sadim safeguarding savoring scalability scalable scavenged scent schizophrenia schr scoffed scorecard scowled scrawled screeched scribbled 
scrolled scrutinize scrutinizing scurried seamless searing seep seeped seeping sellsword sensationalized seraphiel seraphina seraphine shadowblade 
shadows shambled shambling shaping shimmer shimmered shimmering shiver shivered shivers shockwaves shrieked shrouded shuddered sickly sidelining 
sidestepped sighed sigil sigils silas silhouetted siloed silos silverwood simplistic sipped situating skeptically skittered skittering sleek slicked 
slicking slithered slitted slood slumbered slumped smirked smoldered snaked snarled sneered snorted societal socioeconomic softened softening solara 
solidifies solidify solidifying soundlessly sourcing sparkled spasmed speedrunner speedrunners spellbook spellbooks spellcasting spiderwebbed 
spiraled spires spotlighted sprawled sprawling sprinted sputtered squinted squinting stakeholder stakeholders stammered starborn stared starkly 
starlit staticky steadier steadying steeled steeling steepled steepling stewardship stifles stigmatization stilled stillness strategic strategically 
strategies stratification streaked streamline streamlines streamlining streetlamp streetlamps streetlights strengthens strode structuralist stumbled 
suboptimal subtly suffocating sulfurous summative superficiality supervillain surged surmountable sustainability sustains swirled swirling swiveled 
sylas sylvani sylvans symbolizing synergies synergistic synergistically synthesizes systemic taehal tailored tangible tankards tapestry taren 
tattered technological teemed teetered temporality tendril tendrils tenebrous terrans terrifyingly thalassa thalen thalion thalor thalos tharivol 
tharos tharros theron thirdly thog thoran thoren thorgar thorgrim thorne thorned thrain thrax threadbare thrives throbbed throk throngs thrum 
thrummed thrumming thud thudded thudding thunderous ticked tightened tilted timelines tinged tingled tomes torchlight torvin touchpoints tousled 
tousling towering townsfolk traceability transactional transcended transcending transcends transfixed transformative transforms treant trembled 
trembling tremor trepidation triangulation trifled trudged truffula tugged twinge twinkled twinkling twitched unaddressed unassuming unbidden 
unblinking unburdened unclenching unconditioned uncurled undeniable undeniably underachievement underbrush undercity undercurrent underfunded 
underfunding underperformance underpin underpinned underpinning underpinnings underpins underrepresentation underscore underscored underscores 
underscoring underserved understandingly underutilized unease unfazed unflinching unfurling universality unmarred unmet unmoving unnerving 
unnervingly unparalleled unravel unraveling unreadable unremarkable unseeing unsettling unsettlingly unshakeable unshaken unshed unspoken unspooled 
unvarnished unwavering unyielding upheavals urbanization uthgar utilitarianism utilizes utilizing uuwu vael valerius valoria valtor varek varen varyn 
vastness venon verdant veridia veridian veridium verran vespera vexar veyl veyn veyne veyra veyth vial vibrant vibrated viewport viewscreen 
volatilities volkov vorath vorlag vorn vorne voryn voss vrook vrykali vrynn vulnerabilities wafted wailed warily wariness warranting warred wavered 
wavering weariness weathered welled wellspring wheezed whimpered whir whirled whirred whirring whirs whisper whispered whispering whispers 
whisperwind whisperwood whistleblowing whiterun widened winced wincing windowpane windowpanes wizened wojek woodsmoke workflows writhe writhed 
writingprompts xandros xanthean xantheans xaphan xaren xarpti xavius xendari xenobiologist xenobiology xenolinguist xenos xeridian xeridians xhk'kht 
xyla xylar xylara xylia xylo xylons xylophia xylos xylosian xylosians xylossian xylossians xyloth xylothian xylothians xylox xyra y'lgoth yawned 
yearned yellowed yelped yowled zafir zalrex zarek zarthus zephyr zephyra zephyria zephyrian zephyrians zephyrion zephyros zephyrus zetans zha'thik 
zhra'gha zorath zorax zoraxians zorgon zorp zorvath zorvathian zorvathians zydonian zydonians zyla zylar zylara zyloth zylth zyn zyn'thari zyn'thra 
zyra zz'glorg `
        .split(' ')
        .map((word) => word.trim())
        .filter(Boolean),
);

/** Phrases of three content words, each ended by "|". */
export const OVERUSED_PHRASES: ReadonlySet<string> = new Set(
    `
ability adapt changing|across various industries|across various sectors|adapt changing market|address root causes|addressing challenges requires|
addressing root causes|air hung thick|air thick anticipation|air thick scent|air thick smell|air thick tension|also plays crucial|among team members|
another critical aspect|another critical component|another critical factor|another layer complexity|anything ever seen|asked voice barely|
asked voice laced|asked voice low|asked voice trembling|based decision making|began set casting|better health outcomes|beyond surface level|
blood ran cold|breath catching throat|breath caught throat|brow furrowed concentration|brow furrowed concern|brow furrowed confusion|
built upon foundation|casting eerie glow|casting long shadows|casting warm glow|challenge status quo|challenges lay ahead|
changing consumer preferences|changing market conditions|characterized rapid technological|chill ran spine|chill run spine|closer examination reveals|
collaborative problem solving|company invested heavily|compelling case study|complex interplay factors|complex often contradictory|
complex tapestry woven|confront uncomfortable truths|contemporary business landscape|continued fall washing|corporate social responsibility|
cost benefit analysis|could feel power|could feel weight|could find way|could help feel|could help notice|could help wonder|could shake feeling|
creates fertile ground|creates virtuous cycle|creating virtuous cycle|critical role shaping|critical thinking skills|cross functional collaboration|
cross functional teams|crucial role shaping|crucial step towards|culture continuous improvement|culture continuous learning|customer centric approach|
customer satisfaction loyalty|cutting edge technology|data driven approach|data driven decision|data driven decisions|days turned weeks|
decision making process|decision making processes|deep breath feeling|deep breath steeling|deep breath stepped|deep breath trying|
deeply embedded within|delicate balancing act|delivering high quality|dimly lit room|dipped horizon casting|distinct yet interconnected|
door creaked open|door swung open|double edged sword|driven decision making|driving force behind|dust motes danced|elara said voice|end end end|
enhance operational efficiency|ensure long term|ensuring long term|environmental social governance|era defined rapid|essay aims explore|
essay delve multifaceted|essay explore multifaceted|essay explores multifaceted|essay explores significance|essential long term|
ethical business practices|ethical decision making|ever evolving landscape|evidence based approach|evidence based decision|evidence based strategies|
evolving consumer preferences|extend beyond immediate|extend beyond individual|extend far beyond|extended far beyond|extending far beyond|
extends beyond individual|extends beyond mere|extends far beyond|eyes darting around|eyes filled mixture|eyes locked onto|eyes never leaving|
eyes scanning room|eyes wide fear|eyes wide mixture|eyes wide terror|eyes wide wonder|eyes widened shock|eyes widened surprise|
face whatever challenges|faced significant challenges|faces several challenges|faint almost imperceptible|far beyond mere|far beyond simple|
far reaching consequences|far reaching implications|feel sense pride|feel sense unease|felt chill run|felt cold dread|felt glimmer hope|
felt growing sense|felt like eternity|felt sense peace|felt shiver run|felt strange sensation|felt strange sense|figure emerged shadows|
fingers flying across|first time long|flicker something akin|forward thinking approach|foster long term|foster sense community|
fostering culture continuous|fostering long term|fostering sense belonging|fostering sense community|fostering sense shared|fosters sense shared|
future word count|gain deeper understanding|gaze sweeping across|general data protection|goes beyond simply|goes far beyond|grin spreading across|
ground beneath feet|growing body research|growing sense dread|growing sense unease|hand instinctively reaching|heart hammered ribs|heart heavy weight|
heart pounded chest|heart pounding chest|heart skipped beat|help feel sense|help feel twinge|high stakes environment|horizon casting long|
horizon painting sky|however crucial acknowledge|hung air heavy|hung heavy air|hung low sky|hung thick scent|identify areas improvement|
increasingly interconnected world|industry continues evolve|informed decision making|intricately carved wooden|keep voice steady|
key performance indicators|knew chilling certainty|knew one thing|knew road ahead|knew would never|knuckles turning white|landscape continues evolve|
landscape modern business|leaned back chair|leaned forward eyes|level playing field|long could remember|long shadows across|long term benefits|
long term commitment|long term consequences|long term economic|long term goals|long term growth|long term impact|long term investment|
long term outcomes|long term stability|long term strategic|long term success|long term sustainability|long term value|long term viability|
long term vision|looked around room|looked eyes filled|low sky casting|loyal customer base|made decision would|made significant strides|made way back|
maintain competitive edge|maintaining competitive edge|make data driven|make informed choices|make informed decisions|manifest various forms|
manifest various ways|marked pivotal moment|marked significant turning|marked turning point|maybe maybe could|medium sized enterprises|
merely academic exercise|meticulous attention detail|mind already racing|mind raced trying|mind racing implications|mind racing possibilities|
mind racing questions|mind racing tried|mitigate risks associated|modern business landscape|move beyond simplistic|move beyond simply|
moving beyond simple|multi faceted approach|multi pronged approach|must move beyond|navigate complex landscape|navigate complexities modern|
never seen anything|new revenue streams|newfound sense purpose|nodded mind racing|offers valuable insights|one last time|one must first|
one primary challenges|one primary reasons|one size fits|one thing certain|painting sky hues|piercing blue eyes|pivotal role shaping|
play critical role|play crucial role|play pivotal role|play significant role|play vital role|played crucial role|played pivotal role|
played significant role|played vital role|plays critical role|plays crucial role|plays pivotal role|plays significant role|plays vital role|
political economic social|positive work environment|presents significant challenge|problem solving skills|professional development opportunities|
profound far reaching|provide real time|provide valuable insights|provides valuable insights|public awareness campaigns|public private partnerships|
rain continued fall|raised hand silencing|randomized controlled trials|rapid technological advancements|rapid technological change|
rapidly changing world|rapidly evolving landscape|ready face whatever|real time data|real time feedback|real time monitoring|renewed sense purpose|
replied voice steady|requires careful consideration|requires deep understanding|requires multi pronged|requires multifaceted approach|
resonated deep within|rise social media|road ahead would|room fell silent|said trying sound|said voice barely|said voice calm|said voice dripping|
said voice echoing|said voice filled|said voice firm|said voice laced|said voice like|said voice low|said voice smooth|said voice soft|
said voice steady|said voice tight|said voice tinged|said voice trembling|scent damp earth|seen anything like|sense peace wash|sent shiver spine|
sent shivers spine|serves cautionary tale|serves stark reminder|several key areas|shake feeling something|shifting consumer preferences|
shiver ran spine|shiver run spine|shook head trying|short term gains|sighed running hand|significant role shaping|significant turning point|
size fits approach|sky casting long|small intricately carved|small medium sized|small smile playing|smile playing lips|smile spread across|
smile spreading across|smile tugging corners|something else entirely|something else something|spent countless hours|spread across face|
spread like wildfire|spreading across face|stakeholders including employees|stammered voice barely|stepped forward eyes|stepped forward voice|
strategic decision making|strong brand identity|success inextricably linked|success word count|sun began set|sun dipped horizon|sun hung low|
supply chain management|sustainable competitive advantage|taking deep breath|tapestry woven threads|tears streaming face|
technological advancements evolving|testament enduring power|thinking problem solving|threat new entrants|today's fast paced|took deep breath|
took step back|took step closer|took step forward|tried make sense|trying keep voice|trying make sense|turned walked away|turned weeks weeks|
unique value proposition|unlike anything ever|unlock full potential|user generated content|various factors including|voice barely audible|
voice barely whisper|voice low rumble|voice steady despite|voice trembling slightly|weeks weeks months|whatever challenges lay|whatever lay ahead|
whispered voice barely|whispered voice trembling|without fear reprisal|words echoed mind|words hung air|work life balance|world word count|
would find way|would never forget|young woman named|`
        .split('|')
        .map((phrase) => phrase.trim())
        .filter(Boolean),
);
