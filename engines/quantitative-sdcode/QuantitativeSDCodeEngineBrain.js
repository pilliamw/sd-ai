import projectUtils from '../../utilities/utils.js'
import { LLMWrapper } from '../../utilities/LLMWrapper.js'
import { marked } from 'marked';
import logger from '../../utilities/logger.js';

class ResponseFormatError extends Error {
    constructor(message) {
        super(message);
        this.name = "ResponseFormatError";
    }
}

class QuantitativeSDCodeEngineBrain {
    static SDCODE_SYNTAX_GUIDE=
`
To construct SFD models, you will output a program written in a language called SDCode. 
SDCode uses a syntax similar to that of the programming language Python.
Please output your SDCode program in a markdown code block using triple backticks at the start and end;
you will receive an error message if you do not do so as the program cannot be parsed otherwise.

Below is a sample program that highlights all of the syntax rules of SDCode.
\`\`\`
### WRITING COMMENTS: Comments work the exact same they do in Python.
# When using comments to explain the reasoning for a created variable/relationship,
# append the comment directly to the end of the code line, to ensure it is recognized correctly.
# Comments never directly affect how a simulation runs.

### SIMULATION SETUP
# The commands listed below set up the parameters that define how the model simulation should run.

setTimeUnits("year") # The unit of time for this model. This should match with the equations that you generate. Takes a string as its singular argument.
setStartTime(0) # The time at which this model starts calculating. It is measured in the units of "timeUnits". Takes a number as its singular argument.
setStartTime(10.0) # The time at which this model stops calculating. It is measured in the units of "timeUnits". Takes a number as its singular argument.
setTimeStep(0.25) # The time step for the model, how often is it calculated. The most common dt is 0.25. It is measured in the units of "timeUnits". Takes a number as its singular argument.
setIntegrationMethod("euler") # The method used to solve this model. The single required argument is either the string "euler" or "rk4". "euler" is the default, use "rk4" for systems with oscillations.

### NAMING CONVENTIONS
# Model components are identified by a unique name.
# This name is allowed to comprise only of alphanumeric characters, the "_" character, and spaces.
# Unlike python, when defining and referencing these components, the name must be wrapped in [square brackets].

### COMPONENT TYPES
# There are three main component types - stocks, flows, and variables. 
# A stock is an accumulation of its flows, it is an integral. A stock can only change because of its flows. 
# A flow is the derivative of a stock. 
# A plain variable is used for algebraic expressions.

### CREATING VARIABLES
# The single argument taken is a string describing the unit.
[varA] = new Variable("units") # reasoning for creating [varA]
[variable b] = new Variable("units") # reasoning for creating [variable b]
[variable c] = new Variable("units") # reasoning for creating [variable c]

### DEFINING EQUATIONS
# Set the XMILE equation for a component with the .setEquation method. This takes one argument, the XMILE equation as a string.
# Every component must have exactly one XMILE equation defined for it somewhere in the simulation 
# (although it does not need to be immediately after declaration).
# This equation can be a number, or an algebraic expression of other variables.
# Refer to other variables with their [bracketed] name. 
# If the bracketed name contains spaces [like this], replace them with underscores [like_this].
# NEVER use IF THEN ELSE or conditional functions inside of equations. 
# If you want to check for division by zero use the operator //
# STOCKS ONLY: The .setEquation method sets the **initial value** of the stock. The equations for flows are automatically applied;
# you do not need to manually make any INTEG calls.
[varA].setEquation("10") # [varA] is set to the numeric value of 10
[variable b].setEquation("5*[varA]") # [variable b] is set to be 5 times [varA]
[variable c].setEquation("[varA] + [variable_b]") # [variable c] is set to be the sum of [varA] and [variable b]

### CREATING STOCKS
# The single argument taken is a string describing the unit.
[stockA] = new Stock("units")
[stockA].setEquation("100") # [stockA] has an initial value of 100
[stockB] = new Stock("units")
[stockB].setEquation("0") # [stockB] has an initial value of 0

### CREATING FLOWS
# The single argument taken is a string describing the unit.
[flowA] = new Flow("units")
[flowB] = new Flow("units")
[flowA].setEquation("[variable_b]")
[flowB].setEquation("[variable_c]*[stockA]")

### UNIFLOW FLOWS
# By default, all flows are bi-directional.
# Use the .setUniflow method on flows to prevent them from going negative.
# A uniflow flow represents a one-directional process that can only add to or subtract from a stock in one direction.
# If set to uniflow, the flow will be constrained to be non-negative during simulation - if the equation would produce a negative value, 
# it will be set to zero instead.
# Common examples of uniflow flows: births, deaths, purchases, production. 
# Common examples of non-uniflow flows: net migration, balance adjustments, corrections.
[flowA].setUniflow()

### SETTING FLOWS
# Use the .addInflow and .addOutflow methods on a stock to attach flows.
# CRITICAL: A flow can never be both an inflow and outflow of the same stock.
# (However, it is ok for a flow to be the inflow of one stock and the outflow of a different stock.)
[stockA].setInflow([flowA])
[stockA].setOutflow([flowB])
[stockB].setInflow([flowB])

### SPECIFYING RELATIONSHIPS
# You should specify "cause-effect" relationships between every pair of components in the model.
# To do so, use the .connect method, which is available on all components.
# Call the .connect method on the "causal" component.
# The .connect method takes two arguments; the first argument is the "effect" component and is REQUIRED, 
# and the second is an OPTIONAL boolean that indicates the polarity of the relationship.
# Set this to true if the relationship has positive polarity, and false if the relationship has negative polarity.
# In relationships with positive polarity (+) a change in the from variable causes a change in the same direction in the to variable.  For example, in a relationship with positive polarity (+), a decrease in the from variable, would lead to a decrease in the to variable.  The second kind of relationship are those with negative polarity that are represented with a - symbol.  In relationships with negative polarity (-) a change in the from variable causes a change in the opposite direction in the to variable.  For example, in a relationship with negative polarity (-) an increase in the from variable, would lead to a decrease in the to variable.
# If it does not make sense to define a polarity for a relationship, do not pass a boolean at all.
# You can call the .connect method at any point in the model's program, provided both components have been previously defined.
[varA].connect([variable b]) # the reasoning for this relationship
[varA].connect([variable c])
[variable b].connect([variable c])
[variable b].connect([flowA])
[variable c].connect([flowB])
[stockA].connect([flowB])
[flowA].connect([stockA], true)
[flowB].connect([stockA], false)
[flowB].connect([stockB], true)
\`\`\`
`
    static MODULE_REQUIREMENTS_SECTION =
`You are currently unable to produce models with modules.
If you are asked to do so, please respond with an appropriate error message.`

    static SUB_TYPE_REQUIREMENTS_SECTION =
`You are currently unable to produce models with subtypes.
If you are asked to do so, please respond with an appropriate error message.`

    static ARRAY_REQUIREMENTS_SECTION =
`You are currently unable to process models with arrays.
If you are asked to do so, please respond with an appropriate error message.`

    static MANDATORY_PROCESS_SECTION =
`MANDATORY PROCESS - Execute these steps in order:

STEP 1 - IDENTIFY VARIABLES:
Identify all entities with cause-and-effect relationships. Name variables using these rules:
- Maximum 5 words per name
- Minimize total variable count
- Use neutral terminology (no positive/negative connotations)
- Use ONLY letters and spaces (NO symbols, NO dashes, NO arthemtic operators and NO punctuation)

STEP 2 - DEFINE CAUSAL RELATIONSHIPS:
Assign polarity to each causal relationship:
- Positive polarity (+): Variables move together (both increase OR both decrease)
  Example 1: Decrease in cause → decrease in effect = POSITIVE (+)
  Example 2: Increase in cause → increase in effect = POSITIVE (+)
- Negative polarity (-): Variables move opposite (anticorrelated)
  Example 1: Decrease in cause → increase in effect = NEGATIVE (-)
  Example 2: Increase in cause → decrease in effect = NEGATIVE (-)

STEP 3 - DETERMINE VARIABLE TYPES:
Classify each variable as one of three types:
- STOCK: Accumulations that change ONLY via their flows
- FLOW: Derivatives that change stocks (rate of change)
- VARIABLE: Auxiliary variables for algebraic expressions

CRITICAL STOCK-FLOW CONSTRAINT:
- A flow can NEVER appear in BOTH the inflows AND outflows of the same stock
- Each flow must be classified as EITHER an inflow OR an outflow for any given stock, never both

STEP 4 - WRITE EQUATIONS:
Provide equations for every variable:
- CRITICAL XMILE NAMING RULE: When referencing variables in equations, you MUST replace all spaces with underscores
- Example: If a variable is named "birth rate", reference it in equations as "birth_rate"
- Example: If a variable is named "total population", reference it in equations as "total_population"
- This is the XMILE standard and is NON-NEGOTIABLE - equations with spaces in variable names will FAIL
- CONSTANT HANDLING: NEVER embed numerical constants directly in equations with other variables. ALWAYS create separate named variables for all constants. The ONLY exception is the literals 0 and 1 — embed those directly, never externalize them into their own variables.
- Every variable referenced in an equation MUST have its own equation, type, and appear in the relationships list
- UNIFLOW CONSTRAINT FOR FLOWS:
  * Mark a flow as uniflow=true when it represents a one-directional process that should never be negative
  * When uniflow=true, if the flow equation produces a negative value during simulation, it will be automatically constrained to zero
  * Common uniflow=true examples: births, deaths, purchases, production, hiring, shipments
  * Use uniflow=false for bidirectional flows that can legitimately go negative: net migration, balance adjustments, corrections
  * Setting uniflow correctly prevents physically impossible negative flows (e.g., negative births) while allowing valid negative flows
- GRAPHICAL FUNCTION BEST PRACTICES:
  * For all non-time based graphical functions: Design the function so that normal input produces normal output and include the point (1, 1) in your graphical function to ensure that when the input variable equals 1, the output equals 1
  * This normalization principle allows the function to express deviations from normal behavior in both directions
  * Example: A "productivity multiplier from experience" function should pass through (1, 1) so that normal experience (input=1) yields normal productivity (output=1)
  * Time-based graphical functions (using TIME as input) do NOT need to follow this normalization rule`

    static ARRAY_SPECIFIC_EQUATION_REQUIREMENTS =
`You are currently unable to process models with arrays.
If you are asked to do so, please respond with an appropriate error message.`

    static VERIFY_MODEL_SECTION =
`STEP 5 - VERIFY MODEL VALIDITY:
Continuously verify the model produces correct results for correct reasons. Question whether the structure truly represents the described system.`

    static ARRAY_EXAMPLE =
`You are currently unable to process models with arrays.
If you are asked to do so, please respond with an appropriate error message.`

    static MODULE_EXAMPLE =
`You are currently unable to process models with arrays.
If you are asked to do so, please respond with an appropriate error message.`

    static FORMULATION_ERROR_SECTION =
`IDENTIFY FORMULATION ERRORS:
When reviewing or fixing models, detect and correct these common errors:

a. VARIABLE TYPE ERRORS FOR AGGREGATIONS:
   - Simple sums (e.g., total population) MUST be auxiliaries (type "variable"), NOT stocks
   - Stocks represent accumulations via flows; sums are algebraic calculations

b. AVERAGING FUNCTION ERRORS:
   - USE SMOOTH function for moving averages
   - DO NOT USE DELAY1 or DELAY3 for averaging (delays only shift time, they don't average)

- PROVIDE detailed explanation listing: every error found, exact variable name, what was wrong, how it was fixed`

    static MENTOR_ADDITIONAL_CONCERNS =
`EVALUATE MODEL SCOPE (Teaching Focus):
Critically assess model completeness and guide users through questioning:
- Are all relevant variables included?
- Are there missing connections between variables that should exist?
- Work with the user to help them understand where the model might fall short
- Ensure all suggestions follow MECE principle (Mutually Exclusive, Collectively Exhaustive)
- NEVER suggest additions that duplicate existing model elements

EXAMINE STOCK DYNAMICS (Teaching Focus):
For each stock, help the user consider if there are any missing flows which could drive important dynamics relative to their problem statement.`

    static MENTOR_MODE_INTRO =
`You are a System Dynamics Mentor and Teacher. Generate stock and flow models from user-provided text while teaching users to understand and improve their work through Socratic questioning and constructive critique.

PEDAGOGICAL APPROACH:
Your role is to facilitate learning, NOT to provide praise. Execute these teaching principles:
- Ask probing questions that guide users to discover what could be improved in the model
- Think critically about the model and their questions to determine the right questions to ask
- Be a constant source of constructive critique
- Explain problems you identify AND ask questions to help users learn to critique models themselves
- Explicitly state when you lack confidence in your model
- Help users learn System Dynamics principles through dialogue
- Add smaller, logically connected pieces of structure incrementally to the model

CRITICAL TEACHING RESTRICTION:
NEVER identify feedback loops for the user in explanatory text. Let users discover loops themselves through your questioning.`

    static PROFESSIONAL_MODE_INTRO =
`You are a System Dynamics Professional Modeler. Generate stock and flow models from user-provided text following these mandatory rules:`

    static generateSystemPrompt(mentorMode, supportsArrays, supportsModules, supportsSubTypes) {
        let prompt = "";

        // Add intro based on mode
        if (mentorMode) {
            prompt += QuantitativeSDCodeEngineBrain.MENTOR_MODE_INTRO + "\n\n";
        } else {
            prompt += QuantitativeSDCodeEngineBrain.PROFESSIONAL_MODE_INTRO + "\n\n";
        }

        prompt += QuantitativeSDCodeEngineBrain.SDCODE_SYNTAX_GUIDE + "\n\n";

        // Add module requirements if modules are supported
        if (supportsModules) {
            prompt += QuantitativeSDCodeEngineBrain.MODULE_REQUIREMENTS_SECTION + "\n\n";
        }

        // Add array requirements if arrays are supported
        if (supportsArrays) {
            prompt += QuantitativeSDCodeEngineBrain.ARRAY_REQUIREMENTS_SECTION + "\n\n";
        }

        // Add sub-type requirements if sub-types are supported
        if (supportsSubTypes) {
            prompt += QuantitativeSDCodeEngineBrain.SUB_TYPE_REQUIREMENTS_SECTION + "\n\n";
        }

        // Always add mandatory process section
        prompt += QuantitativeSDCodeEngineBrain.MANDATORY_PROCESS_SECTION + "\n\n";

        // Add array-specific equation requirements if arrays are supported
        if (supportsArrays) {
            prompt += QuantitativeSDCodeEngineBrain.ARRAY_SPECIFIC_EQUATION_REQUIREMENTS + "\n\n";
        }

        // Always add verify model section
        prompt += QuantitativeSDCodeEngineBrain.VERIFY_MODEL_SECTION;

        // Add mentor-specific concerns if in mentor mode
        if (mentorMode) {
            prompt += "\n\nSTEP 6 - " + QuantitativeSDCodeEngineBrain.MENTOR_ADDITIONAL_CONCERNS;
            prompt += "\n\nSTEP 7 - " + QuantitativeSDCodeEngineBrain.FORMULATION_ERROR_SECTION;
        } else {
            prompt += "\n\nSTEP 6 - " + QuantitativeSDCodeEngineBrain.FORMULATION_ERROR_SECTION;
        }

        // Add examples based on what's supported
        if (supportsArrays) {
            prompt += "\n\n" + QuantitativeSDCodeEngineBrain.ARRAY_EXAMPLE;
        }

        if (supportsModules) {
            prompt += "\n\n" + QuantitativeSDCodeEngineBrain.MODULE_EXAMPLE;
        }

        return prompt;
    }

    static MENTOR_SYSTEM_PROMPT = QuantitativeSDCodeEngineBrain.generateSystemPrompt(true, true, true)

    static DEFAULT_SYSTEM_PROMPT = QuantitativeSDCodeEngineBrain.generateSystemPrompt(false, true, true)

    static DEFAULT_ASSISTANT_PROMPT = 
`I want your response to consider the model which you have already so helpfully given to us. You should never change the name of any variable you've already given us. Your response should add new variables wherever you have evidence to support the existence of the relationships needed to close feedback loops.  Sometimes closing a feedback loop will require you to add multiple relationships.`

    static DEFAULT_BACKGROUND_PROMPT =
`Please be sure to consider the following critically important background information when you give your answer.

{backgroundKnowledge}`

    static DEFAULT_PROBLEM_STATEMENT_PROMPT = 
`The user has stated that they are conducting this modeling exercise to understand the following problem better.

{problemStatement}`

    #data = {
        backgroundKnowledge: null,
        problemStatement: null,
        openAIKey: null,
        googleKey: null,
        mentorMode: false,
        underlyingModel: LLMWrapper.BUILD_DEFAULT_MODEL,
        systemPrompt: null, // Will be generated in constructor based on mentorMode and supportsArrays
        assistantPrompt: QuantitativeSDCodeEngineBrain.DEFAULT_ASSISTANT_PROMPT,
        backgroundPrompt: QuantitativeSDCodeEngineBrain.DEFAULT_BACKGROUND_PROMPT,
        problemStatementPrompt: QuantitativeSDCodeEngineBrain.DEFAULT_PROBLEM_STATEMENT_PROMPT,
        supportsArrays: false,
        supportsModules: false,
        supportsSubTypes: false
    };

    #llmWrapper;

    constructor(params) {
        Object.assign(this.#data, params);

        // Generate system prompt based on mentor mode, array support, module support, and sub-type support if not explicitly provided
        if (!this.#data.systemPrompt) {
            this.#data.systemPrompt = QuantitativeSDCodeEngineBrain.generateSystemPrompt(
                this.#data.mentorMode,
                this.#data.supportsArrays,
                this.#data.supportsModules,
                this.#data.supportsSubTypes
            );
        }

        if (!this.#data.problemStatementPrompt.includes('{problemStatement')) {
            this.#data.problemStatementPrompt = this.#data.problemStatementPrompt.trim() + "\n\n{problemStatement}";
        }

        if (!this.#data.backgroundPrompt.includes('{backgroundKnowledge')) {
            this.#data.backgroundPrompt = this.#data.backgroundPrompt.trim() + "\n\n{backgroundKnowledge}";
        }

        this.#llmWrapper = new LLMWrapper(this.#data);

    }

    #filterInvalidRelationships(response, variablesByFoldedName) {
        const origRelationships = response.relationships || [];
        const seenPairs = new Set();
        const validRelationships = [];

        for (const relationship of origRelationships) {
            const from = relationship.from.trim();
            const to = relationship.to.trim();
            const foldedFrom = projectUtils.caseFold(from);
            const foldedTo = projectUtils.caseFold(to);

            if (foldedFrom === foldedTo) continue;

            const toVar = variablesByFoldedName.get(foldedTo);
            if (!toVar || !variablesByFoldedName.has(foldedFrom)) continue;

            if (toVar.crossLevelGhostOf && toVar.crossLevelGhostOf.length > 0) continue;

            if (from.includes('[') || to.includes('[')) continue;

            const pairKey = foldedFrom + '\x00' + foldedTo;
            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);

            const cleaned = Object.assign({}, relationship);
            cleaned.from = from;
            cleaned.to = to;
            validRelationships.push(cleaned);
        }

        response.relationships = validRelationships;
    }

    #cleanStockFlowsAndCollectUsage(stocks, variablesByFoldedName, usedFlowNames) {
        const cleanList = (list) => {
            const result = [];
            for (const flowName of list) {
                const cleaned = flowName.replace(/\[.*?\]/g, '').trim();
                if (cleaned.length === 0) continue;
                const folded = projectUtils.caseFold(cleaned);
                if (!variablesByFoldedName.has(folded)) continue;
                result.push(cleaned);
                usedFlowNames.add(folded);
            }
            return result;
        };

        for (const v of stocks) {
            if (Array.isArray(v.inflows)) v.inflows = cleanList(v.inflows);
            if (Array.isArray(v.outflows)) v.outflows = cleanList(v.outflows);
        }
    }

    #inferStockFlowsFromRelationships(response, variablesByFoldedName, usedFlowNames) {
        // LLMs like gemini-3-flash-preview don't reliably emit inflow/outflow lists for stocks,
        // so derive them from flow→stock relationships (polarity decides in vs out).
        const flowSetsByStock = new Map();

        const ensureSets = (stockVar) => {
            let sets = flowSetsByStock.get(stockVar);
            if (sets) return sets;
            if (!stockVar.inflows) stockVar.inflows = [];
            if (!stockVar.outflows) stockVar.outflows = [];
            sets = {
                inflows: new Set(stockVar.inflows.map(f => projectUtils.caseFold(f))),
                outflows: new Set(stockVar.outflows.map(f => projectUtils.caseFold(f)))
            };
            flowSetsByStock.set(stockVar, sets);
            return sets;
        };

        for (const relationship of response.relationships) {
            const toVariable = variablesByFoldedName.get(projectUtils.caseFold(relationship.to));
            if (!toVariable || toVariable.type !== 'stock') continue;
            const fromVariable = variablesByFoldedName.get(projectUtils.caseFold(relationship.from));
            if (!fromVariable || fromVariable.type !== 'flow') continue;

            const sets = ensureSets(toVariable);
            const foldedFromName = projectUtils.caseFold(fromVariable.name);
            if (sets.inflows.has(foldedFromName) || sets.outflows.has(foldedFromName)) continue;

            if (relationship.polarity === '-') {
                toVariable.outflows.push(fromVariable.name);
                sets.outflows.add(foldedFromName);
            } else {
                toVariable.inflows.push(fromVariable.name);
                sets.inflows.add(foldedFromName);
            }
            usedFlowNames.add(foldedFromName);
        }
    }

    #fixVariablesAndConvertEquations(response, usedFlowNames, variableNameMap, namesToConvert) {
        // Compile the XMILE replacement regex ONCE (skip entirely if nothing to convert).
        let combinedRegex = null;
        let replaceFn = null;
        if (namesToConvert.length > 0) {
            // Longest-first so the alternation prefers longer matches at each position.
            namesToConvert.sort((a, b) => b.length - a.length);
            const escaped = namesToConvert.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            combinedRegex = new RegExp(
                '(?<=[\\s\\(\\[,+\\-*/^=<>]|^)(' + escaped.join('|') + ')(?=[\\s\\)\\],+\\-*/^=<>]|$)',
                'g'
            );
            replaceFn = (match) => variableNameMap.get(match) || match;
        }

        // Single pass per variable handles: orphan-flow demotion, DT→TIME, forElements
        // normalization, and XMILE replacement across equation, arrayEquations, and
        // additionalProperties.
        for (const v of response.variables) {
            if (v.type === 'flow' && !usedFlowNames.has(projectUtils.caseFold(v.name))) {
                v.type = 'variable';
            } else if (v?.graphicalFunction?.points?.length > 0 && v.equation) {
                if (v.equation.trim().toLowerCase() === 'dt') {
                    v.equation = 'TIME';
                }
            }

            if (Array.isArray(v.arrayEquations)) {
                for (const eq of v.arrayEquations) {
                    if (!Array.isArray(eq.forElements)) {
                        eq.forElements = typeof eq.forElements === 'string'
                            ? eq.forElements.split(',').map(s => s.trim())
                            : [];
                    }
                }
            }

            if (!combinedRegex) continue;

            if (typeof v.equation === 'string' && v.equation) {
                const original = v.equation;
                v.equation = original.replace(combinedRegex, replaceFn);
                if (original !== v.equation) {
                    logger.debug(`[XMILE Conversion] Variable "${v.name}": "${original}" → "${v.equation}"`);
                }
            }

            if (Array.isArray(v.arrayEquations)) {
                for (const eq of v.arrayEquations) {
                    if (typeof eq.equation === 'string' && eq.equation) {
                        const original = eq.equation;
                        eq.equation = original.replace(combinedRegex, replaceFn);
                        if (original !== eq.equation) {
                            logger.debug(`[XMILE Conversion] Variable "${v.name}"[${eq.forElements.join(',')}]: "${original}" → "${eq.equation}"`);
                        }
                    }
                }
            }

            if (v.subType && v.additionalProperties && typeof v.additionalProperties === 'object') {
                for (const key of Object.keys(v.additionalProperties)) {
                    const val = v.additionalProperties[key];
                    if (typeof val !== 'string') continue;
                    const replaced = val.replace(combinedRegex, replaceFn);
                    if (replaced !== val) {
                        v.additionalProperties[key] = replaced;
                        logger.debug(`[XMILE Conversion] Variable "${v.name}" additionalProperties.${key}: "${val}" → "${replaced}"`);
                    }
                }
            }
        }
    }

    async #parseExplanation(response) {
        if (response.explanation) {
            response.explanation = await marked.parse(response.explanation);
        }
    }

    #mergeModules(response, usedModules, moduleNameMapping) {
        if (!response.modules) response.modules = [];

        // Single pass: build existing-modules lookup AND honor parentModule chains
        // (a module referenced only as someone's parent is still in use).
        const existingModulesMap = new Map();
        for (const m of response.modules) {
            if (m.name) {
                const normalized = projectUtils.caseFold(m.name);
                if (!existingModulesMap.has(normalized)) {
                    existingModulesMap.set(normalized, m);
                }
            }
            if (m.parentModule && m.parentModule.trim().length > 0) {
                const normalizedParent = projectUtils.caseFold(m.parentModule);
                usedModules.add(normalizedParent);
                if (!moduleNameMapping.has(normalizedParent)) {
                    moduleNameMapping.set(normalizedParent, m.parentModule);
                }
            }
        }

        const newModules = [];
        for (const normalized of usedModules) {
            const existing = existingModulesMap.get(normalized);
            if (existing) {
                newModules.push(existing);
            } else {
                newModules.push({
                    name: moduleNameMapping.get(normalized),
                    parentModule: ""
                });
            }
        }

        response.modules = newModules;
    }

    async processResponse(originalResponse) {
        originalResponse.variables = originalResponse.variables || [];

        // Pass 1: ONE walk over variables that builds every lookup structure the
        // downstream helpers need — fold-name map, XMILE rename table, module
        // usage, and a stocks-only list to avoid filtering again in pass 2.
        const variablesByFoldedName = new Map();
        const variableNameMap = new Map();   // raw name → xmile name (spaces → underscores)
        const namesToConvert = [];           // raw names needing XMILE conversion
        const usedModules = new Set();       // fold(moduleName) for any module referenced by a variable
        const moduleNameMapping = new Map(); // fold(moduleName) → canonical capitalization
        const stocks = [];

        for (const v of originalResponse.variables) {
            if (!v.name) continue;

            variablesByFoldedName.set(projectUtils.caseFold(v.name), v);

            if (v.type === 'stock') stocks.push(v);

            if (v.name.includes(' ')) {
                variableNameMap.set(v.name, projectUtils.xmileName(v.name));
                namesToConvert.push(v.name);
            }

            if (v.name.includes('.')) {
                const parts = v.name.split('.');
                for (let i = 0; i < parts.length - 1; i++) {
                    const normalized = projectUtils.caseFold(parts[i]);
                    usedModules.add(normalized);
                    if (!moduleNameMapping.has(normalized)) {
                        moduleNameMapping.set(normalized, parts[i]);
                    }
                }
            }
        }

        this.#filterInvalidRelationships(originalResponse, variablesByFoldedName);

        // Pass 2: walk stocks only — clean inflow/outflow refs and seed the
        // used-flow set. #inferStockFlowsFromRelationships then adds any
        // additional flows it derives from relationships.
        const usedFlowNames = new Set();
        this.#cleanStockFlowsAndCollectUsage(stocks, variablesByFoldedName, usedFlowNames);
        this.#inferStockFlowsFromRelationships(originalResponse, variablesByFoldedName, usedFlowNames);

        // Pass 3: combined per-variable mutation pass — flow-type fixup,
        // DT→TIME, forElements normalization, and XMILE rewriting.
        this.#fixVariablesAndConvertEquations(originalResponse, usedFlowNames, variableNameMap, namesToConvert);

        // No variable loop needed — module usage was already collected in pass 1.
        this.#mergeModules(originalResponse, usedModules, moduleNameMapping);

        await this.#parseExplanation(originalResponse);

        return originalResponse;
    }

    mentor() {
        this.#data.mentorMode = true;
        this.#data.systemPrompt = QuantitativeSDCodeEngineBrain.generateSystemPrompt(
            this.#data.mentorMode,
            this.#data.supportsArrays,
            this.#data.supportsModules,
            this.#data.supportsSubTypes
        );
    }

    setupLLMParameters(userPrompt, lastModel) {
        //start with the system prompt
        const { underlyingModel, systemRole, temperature, reasoningEffort } = this.#llmWrapper.getLLMParameters();
        let systemPrompt = this.#data.systemPrompt;
        let responseFormat = this.#llmWrapper.generateQuantitativeSDCodeResponseSchema(this.#data.mentorMode);

        if (!this.#llmWrapper.model.hasStructuredOutput) {
            throw new Error("Unsupported LLM " + this.#data.underlyingModel + " it does support structured outputs which are required.");
        }

        let messages = [{
            role: systemRole,
            content: systemPrompt
        }];

        if (this.#data.backgroundKnowledge) {
            messages.push({
                role: "user",
                content:  this.#data.backgroundPrompt.replaceAll("{backgroundKnowledge}", this.#data.backgroundKnowledge),
            });
        }
        if (this.#data.problemStatement) {
            messages.push({
                role: systemRole,
                content: this.#data.problemStatementPrompt.replaceAll("{problemStatement}", this.#data.problemStatement),
            });
        }

        // Check if lastModel has actual content (variables or relationships)
        if (lastModel && (lastModel.variables?.length > 0 || lastModel.relationships?.length > 0)) {
            messages.push({ role: "assistant", content: JSON.stringify(lastModel, null, 2) });

            if (this.#data.assistantPrompt)
                messages.push({ role: "user", content: this.#data.assistantPrompt });
        }

        //give it the user prompt
        messages.push({ role: "user", content: userPrompt });

        return {
            messages,
            model: underlyingModel,
            responseFormat: responseFormat,
            temperature: temperature,
            reasoningEffort: reasoningEffort
        };
    }

    async generateModel(userPrompt, lastModel) {
        // Ensure lastModel is always defined as an empty model structure if undefined or null
        if (!lastModel || typeof lastModel !== 'object') {
            lastModel = { variables: [], relationships: [] };
        } else {
            // Ensure required arrays exist
            lastModel.variables = lastModel.variables || [];
            lastModel.relationships = lastModel.relationships || [];
        }

        const llmParams = this.setupLLMParameters(userPrompt, lastModel);

        //get what it thinks the relationships are with this information
        const originalResponse = await this.#llmWrapper.createChatCompletion(
            llmParams.messages,
            llmParams.model,
            llmParams.responseFormat,
            llmParams.temperature,
            llmParams.reasoningEffort
        );
        console.log(originalResponse);
        throw new ResponseFormatError("TODO: Parse SDCode and convert to JSON");
        if (originalResponse.refusal) {
            throw new ResponseFormatError(originalResponse.refusal);
        } else if (originalResponse.parsed) {
            return this.processResponse(originalResponse.parsed);
        } else if (originalResponse.content) {
            let parsedObj = {variables: [], relationships: []};
            try {
                parsedObj = JSON.parse(originalResponse.content);
            } catch (err) {
                logger.log('Bad JSON from LLM:', originalResponse);
                throw new ResponseFormatError("Bad JSON returned by underlying LLM");
            }
            return this.processResponse(parsedObj);
        } else {
            throw new ResponseFormatError("LLM response did not contain any recognized format (no refusal, parsed, or content fields)");
        }
    }
}

export default QuantitativeSDCodeEngineBrain;