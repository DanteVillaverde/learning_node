function gcom_rebcont_Process(pStrSuppliers, pStrSQLCond, pDateProcess) {

    /**
     *  LOCAL FUNCTION: __getPendingSubperiods
     * 
     *      Creates a map of pending sub-periods for a settlement or provision 
     *      to be processed.
     * 
     *      Each element of the map has the start and end of the period to be 
     *      processed, to search for purchases by volume and the key as the end 
     *      of the sub-period, to validate the process date.
     * 
     *      PARAMETERS:
     *      ==============
     *      @param    {Date}      pDateReb_fecini    Date start rebate contract.
     *      @param    {Date}      pDateReb_lastliq   Date of last process performed.
     *      @param    {Integer}   pIntPernat         Period 1: Natural 0: Not natural.
     *      @param    {Integer}   pIntMonthsPeriod   Duration of the period in 
     *                                               months(monthly, quarterly, etc.).
     * 
     *      @returns  {Map}                          Map of pending subperiods.
     */
    function __getPendingSubperiods(pDateReb_fecini, pDateReb_lastliq, pIntPernat, pIntMonthsPeriod) {
        let mMapPeriod = new Map();

        /**
         * If there are not settlements, consider last settlement as 
         * start contract date
         */
        let mDateReb_fecini  = pDateReb_fecini;
        let mDateReb_lastliq = pDateReb_lastliq
            ? new Ax.sql.Date(pDateReb_lastliq).addDay(1)
            : pDateReb_fecini;

        /**
         * Contract with false start date for calendar periods and for the first 
         * period only, the start date will return to normal.
         */
        if (pIntPernat == 1) {
            mDateReb_fecini = new Ax.sql.Date(
                pDateReb_fecini.getFullYear(),
                pDateReb_fecini.getMonth() + 1,
                1
            );
        }

        /**
         * Calculates the number of months between the start of the period
         * and the last process and adjusts the start of the next period
         * based on the length of the period. based on the duration
         */
        let mIntMonthsBetween = mDateReb_fecini.months(mDateReb_lastliq);
        let mIntMonthsToStartPeriod = Math.floor(mIntMonthsBetween / pIntMonthsPeriod) * pIntMonthsPeriod;

        let mDateStartPeriod = mDateReb_fecini.addMonth(mIntMonthsToStartPeriod);
        let mDateEndPeriod   = mDateStartPeriod.addMonth(pIntMonthsPeriod).addDay(-1);

        let mIntNumSubperiod = 1;

        /**
         * We iterate through the number of months contained in a period
         */
        for (let i=0; i < pIntMonthsPeriod; i++) {
            /**
             * Calculate end subperiod, from start subperiod
             */
            let mDateEnd_Subperiod = mDateReb_fecini.addMonth(mIntMonthsToStartPeriod + i + 1).addDay(-1);
            let mIntSettlement = (i + 1) == pIntMonthsPeriod
                 ? SETTLEMENT 
                 : PROVISION;

            /**
             * If the subperiod is prior to the last period or is the same 
             * date of the last process performed, it will be omitted.
             */
            if (mDateEnd_Subperiod.before(mDateReb_lastliq) ||
                mDateEnd_Subperiod.days(mDateReb_lastliq.addDay(-1)) == 0 ) {
                continue;
            }

            mMapPeriod.set(
                mDateEnd_Subperiod.format(DATE_FORMAT),
                {
                    start_period  : mIntMonthsToStartPeriod == 0 ? pDateReb_fecini : mDateStartPeriod,
                    end_period    : mDateEndPeriod,
                    end_subperiod : mDateEnd_Subperiod,
                    settlement    : mIntSettlement,
                    subperiod     : mIntNumSubperiod
                }
            );

            mIntNumSubperiod++;
        }

        return mMapPeriod
    }

    /**
     *  LOCAL FUNCTION: __getPastSubPeriods
     * 
     *      Generates the subperiods to estimate rebate amount of the provision
     * 
     *      PARAMETERS:
     *      ==============
     *      @param    {Date}       pDateProcess       Date of process
     *      @param    {Integer}    pIntMonthsRemain   Number of months to complete the period
     *      @param    {String}     pStrTypeCalc       Type of calcution for provision
     * 
     *      @returns  {Array}        Past periods
     */
    function __getPastSubPeriods(pDateProcess, pIntMonthsRemain, pStrTypeCalc) {
        let mArrPastPeriods = [];

        let mObjBackTime = Ax.db.executeQuery(`
            <select>
                <columns>
                    mesret, anyret
                </columns>
                <from table='gcom_rebcont_calc_provh'/>
                <where>
                    codigo = ?
                </where>
            </select>
        `, pStrTypeCalc).toOne();

        let mMapFactors = Ax.db.executeQuery(`
            <select>
                <columns>
                    mes, porcen
                </columns>
                <from table='gcom_rebcont_calc_provl'/>
                <where>
                    codigo = ?
                </where>
            </select>
        `, pStrTypeCalc).toMapByKey("mes");

        /**
         * We go back the months and years defined in the type of provision
         * calculation, we obtain the months necessary to complete the purchases
         * of the period.
         */
        let mDateBackInitial = pDateProcess.addYear(-mObjBackTime.anyret).addMonth(-mObjBackTime.mesret).addDay(1)
        let mIntMonthBack    = mDateBackInitial.getMonth() + 1;

        for (let i = 0 ; i < pIntMonthsRemain - 1; i++) {
            let mIntMonthSelected = mIntMonthBack + i;

            /**
             * Search the increase/decrement percentage of the month
             */
            let mBcFactor = mMapFactors.get(mIntMonthSelected.toString()).porcen ?? 1;

            let mDateFecini = mDateBackInitial.addMonth(i);
            let mDateFecfin = mDateBackInitial.addMonth(i+1).addDay(-1);

            mArrPastPeriods.push(
                {
                    fecini : mDateFecini,
                    fecfin : mDateFecfin,
                    factor : mBcFactor
                }
            )
        }

        return mArrPastPeriods;
    }

    /**
     *  LOCAL FUNCTION: __processGcom_rebcont
     * 
     *      Do all the process to make the settlement/provision of each 
     *      rebate contract
     * 
     *      PARAMETERS:
     *      ==============
     *      @param    {Object}    pObjGcom_rebcont   Rebate contract data
     *      @param    {Date}      pDateStartPeriod   Start period date
     *      @param    {Date}      pDateProcess       Date of process execution
     *      @param    {Integer}   pIntSettlement     1:Settlement   0:Provision
     * 
     */
    function __processGcom_rebcont(pObjGcom_rebcont, pDateStartPeriod, pDateProcess, 
                                   pIntSettlement,   pMapSubperiods) {
        /**
         * Always cancel provision of previous month ,except in the beginning of 
         * the period
         */
        if (pDateStartPeriod.addMonth(1).addDay(-1).days(pDateProcess) != 0) {
            __cancelProvision(
                pObjGcom_rebcont,
                pDateProcess
            );
        };

        /**
         * We create an object with in case there is more than one supplier to 
         * settle, it will be stored in an object to store the quantities of 
         * each of those suppliers.
         */
        let mMapSuppliers = Ax.db.executeQuery(`
            <select>
                <columns>
                    supp_code,
                    0 gross_amount,
                    0 net_amount,
                    0 quantity
                </columns>
                <from table='gcom_rebcont_suppliers'/>
                <where>
                        reb_seqno   = ?
                    AND supp_settle = 1
                </where>
            </select>
        `, pObjGcom_rebcont.reb_seqno).toMapByKey('supp_code');

        /**
         * Array containing all subperiods, either provisioning or liquidation.
         */
        let mArrSubperiods = [
            {
                fecini : pDateStartPeriod,
                fecfin : pDateProcess,
                factor : 1.0
            }
        ]

        /**
         * Provisions gets others purchases to calculate total rebate amount
         */
        if (!pIntSettlement) {
            let mArrPastSubperiods = __getPastSubPeriods(pDateProcess, pMapSubperiods.size - 1, pObjGcom_rebcont.reb_calc_prov);

            mArrSubperiods = [...mArrSubperiods, ...mArrPastSubperiods];
        }

        /**
         * Gets the conditions to search volume purchases 
         */
        let mStrSQLSource = __getSQLCondSource(pObjGcom_rebcont.reb_seqno);

        /**
         * Gets total purchases
         */
        let mObjTotalVolume = __getVolumePurchases(
            pObjGcom_rebcont,
            mArrSubperiods,
            mStrSQLSource,
            mMapSuppliers
        );

        /**
         * If there are not purchases, generates a provision/settlement purchase
         * delivery note without amount
         */
        if (Ax.math.bc.isZero(mObjTotalVolume.tot_gross_amount) &&
            Ax.math.bc.isZero(mObjTotalVolume.tot_net_amount)   &&
            Ax.math.bc.isZero(mObjTotalVolume.tot_quantity))
        {
            let mObjHeaderData = {
                tipdir  : TIPDIR,
                empcode : pObjGcom_rebcont.reb_empcode,
                tipdoc  : pIntSettlement ? pObjGcom_rebcont.type_dlvliq : pObjGcom_rebcont.type_dlvpro,
                fecmov  : pDateProcess,
                tercer  : pObjGcom_rebcont.reb_tercer,
                dtogen  : 0,
                dtopp   : 0,
                refter  : pObjGcom_rebcont.reb_docser
            };

            let mArrLines = [
                {
                    codart : pObjGcom_rebcont.type_item,
                    varlog : '0',
                    precio : 0,
                    canmov : 1
                }
            ]
            
            __generateGcommovh(mObjHeaderData, mArrLines, null)
            
            Ax.db.update("gcom_rebcont",
                {
                    reb_lastliq : pDateProcess
                },
                {
                    reb_seqno : pObjGcom_rebcont.reb_seqno
                }
            );

            return;
        }

        /**
         * Select the comparation amount 
         */
        let mBcCompAmount;

        switch (pObjGcom_rebcont.reb_bascom) {
            case GROSS_AMOUNT_BASE:
                mBcCompAmount = mObjTotalVolume.tot_gross_amount;
                break;

            case NET_AMOUNT_BASE:
                mBcCompAmount = mObjTotalVolume.tot_net_amount;
                break;

            case QUANTITY_BASE:
                mBcCompAmount =  mObjTotalVolume.tot_quantity;
                break;
        }

        /**
         * Calculate rebate amount of the purchases 
         */
        let mObjRebate = __calculateRebate(
            pObjGcom_rebcont.reb_allrange,
            pObjGcom_rebcont.reb_seqno,
            pObjGcom_rebcont.reb_bascom,
            mObjTotalVolume,
            mBcCompAmount
        );

        let mBcRebAmount = mObjRebate.reb_amount;
        let mArrSettinfo = mObjRebate.arr_settinfo;

        /**
         * When there is an amount to be given away, there must be an article in 
         * the typology in which it can be assigned with that amount.
         */
        if (!Ax.math.bc.isZero(mBcRebAmount) && !pObjGcom_rebcont.type_item) {
            throw new Ax.ext.Exception("gcom_rebcont_Process_NO_ITEM",
                "Contrato [${docser}] : No hay artículo asignado en la tiplogía [${type}] para el importe.",
                {
                    docser : pObjGcom_rebcont.reb_docser,
                    type   : pObjGcom_rebcont.reb_type
                }
            );
        }

        /**
         * Insert settlement data
         */
        let mObjGcom_rebcont_settle = {
            reb_seqno            : pObjGcom_rebcont.reb_seqno,
            liq_tercer           : pObjGcom_rebcont.reb_tercer,
            liq_provis           : !pIntSettlement,
            liq_fecini           : pDateStartPeriod,
            liq_fecfin           : pDateProcess,
            liq_per_gross_amount : mObjTotalVolume.tot_gross_amount,
            liq_per_net_amount   : mObjTotalVolume.tot_net_amount,
            liq_per_qty          : mObjTotalVolume.tot_quantity,
            liq_reb_amount       : mBcRebAmount
        }

        let mIntLiqseqno = Ax.db.insert("gcom_rebcont_settle", mObjGcom_rebcont_settle).getSerial();

        mArrSettinfo.forEach(mRowSettInfo =>{
            Ax.db.insert("gcom_rebcont_settinfo",
                {
                    liq_seqno      : mIntLiqseqno,
                    liq_from	   : mRowSettInfo.liq_from,
                    liq_to	       : mRowSettInfo.liq_to,
                    liq_bascal	   : mRowSettInfo.liq_bascal,
                    liq_formul	   : mRowSettInfo.liq_formul,
                    liq_value	   : mRowSettInfo.liq_value,
                    liq_reb_qty	   : mRowSettInfo.liq_reb_qty,
                    liq_reb_amount : mRowSettInfo.liq_reb_amount,
                    liq_artreg	   : mRowSettInfo.liq_artreg,
                    liq_varreg     : mRowSettInfo.liq_varreg
                }
            );
        })

        /**
         * If there are two or more settlement suppliers, will insert
         * distribution of suppliers
         */
        if (mMapSuppliers.size() > 1) {
            for (let [mStrSuppCode, mObjSupplier] of mMapSuppliers) {
                Ax.db.insert("gcom_rebcont_suppdist",
                    {
                        liq_seqno	         : mIntLiqseqno,
                        reb_seqno	         : pObjGcom_rebcont.reb_seqno,
                        liq_supplier	     : mStrSuppCode,
                        liq_per_gross_amount : mObjSupplier.gross_amount,
                        liq_per_net_amount	 : mObjSupplier.net_amount,
                        liq_per_qty          : mObjSupplier.quantity
                    }
                );
            }
        }

        /**
         * Process settlement or provision
         */
        __genSettlement(mIntLiqseqno, pObjGcom_rebcont)

        /**
         * Last settlement is always an setlement or provision
         */
        Ax.db.update("gcom_rebcont",
            {
                reb_lastliq : pDateProcess
            },
            {
                reb_seqno : pObjGcom_rebcont.reb_seqno
            }
        );
    }

    /**
     *  LOCAL FUNCTION: __cancelProvision
     *
     *      Generate a provision cancellation delivery note for the last 
     *      provision generated.
     *
     *      PARAMETERS:
     *      ==============
     *      @param    {Object}      pObjGcom_rebcont  Rebate contract data
     *      @param    {Date}        pDateProcess      Date when the process is executed
     */
    function __cancelProvision (pObjGcom_rebcont, pDateProcess) {
        /**
         * We cancel the previous month's provision
         */
        let mIntMonthCancel = pDateProcess.getMonth();
        let mIntYearCancel  = pDateProcess.getFullYear();

        let mIntCabid;

        let mRsGcommovh = Ax.db.executeQuery(`
            <select>
                <columns>
                    <!-- Head columns -->
                    gcommovh.cabid       gcommovh_cabid,       gcommovd.docdes          gcommovd_docdes,
                    gcommovh.tipdoc      gcommovh_tipdoc,      gcommovh.empcode         gcommovh_empcode,
                    gcommovh.depart      gcommovh_depart,      gcommovh.delega          gcommovh_delega,
                    gcommovh.fecmov      gcommovh_fecmov,      gcommovh.almori          gcommovh_almori,
                    gcommovh.fecpro      gcommovh_fecpro,      gcommovh.almdes          gcommovh_almdes,
                    gcommovh.tercer      gcommovh_tercer,      gcommovh.tipdir          gcommovh_tipdir,
                    gcommovh.cambio      gcommovh_cambio,      gcommovh.divisa          gcommovh_divisa,
                    gcommovh.doclock     gcommovh_doclock,     gcommovh.docproc         gcommovh_docproc,
                    gcommovh.tipefe      gcommovh_tipefe,      gcommovh.frmpag          gcommovh_frmpag,
                    gcommovh.direnv      gcommovh_direnv,      gcommovh.terenv          gcommovh_terenv,
                    gcommovh.terfac      gcommovh_terfac,      gcommovh.dirfac          gcommovh_dirfac,
                    gcommovh.direxp      gcommovh_direxp,      gcommovh.terexp          gcommovh_terexp,
                    gcommovh.muelle      gcommovh_muelle,      gcommovh.refter          gcommovh_refter,
                    gcommovh.direcc      gcommovh_direcc,      gcommovh.nommos          gcommovh_nommos,
                    gcommovh.poblac      gcommovh_poblac,      gcommovh.codnac          gcommovh_codnac,
                    gcommovh.codpos      gcommovh_codpos,      gcommovh.nomnac          gcommovh_nomnac,
                    gcommovh.codprv      gcommovh_codprv,      gcommovh.nomprv          gcommovh_nomprv,
                    gcommovh.telef2      gcommovh_telef2,      gcommovh.telef1          gcommovh_telef1,
                    gcommovh.fax         gcommovh_fax,         gcommovh.email           gcommovh_email,
                    gcommovh.albh_gross  gcommovh_albh_gross,  gcommovh.oriaux          gcommovh_oriaux,
                    gcommovh.zimemp      gcommovh_zimemp,      gcommovh.zimter          gcommovh_zimter,
                    gcommovh.codpar      gcommovh_codpar,      gcommovh.codpre          gcommovh_codpre,
                    gcommovh.numexp      gcommovh_numexp,      gcommovh.conten          gcommovh_conten,
                    gcommovh.desadu      gcommovh_desadu,      gcommovh.dosier          gcommovh_dosier,
                    gcommovh.destra      gcommovh_destra,      gcommovh.clasif          gcommovh_clasif,
                    gcommovh.dtopp       gcommovh_dtopp,       gcommovh.dtogen          gcommovh_dtogen,
                    gcommovh.porgar      gcommovh_porgar,      gcommovh.valor           gcommovh_valor,
                    gcommovh.send_wms    gcommovh_send_wms,    gcommovh.portes          gcommovh_portes,
                    gcommovh.indmod      gcommovh_indmod,      gcommovh.post_hupd       gcommovh_post_hupd,
                    gcommovh.albaran_num gcommovh_albaran_num, gcommovh.albaran_ser     gcommovh_albaran_ser,
                    gcommovh.imptot      gcommovh_imptot,      gcommovh.impant          gcommovh_impant,
                    gcommovh.impnxt      gcommovh_impnxt,      gcommovh.impant_ntax     gcommovh_impant_ntax,
                    gcommovh.impaux      gcommovh_impaux,      gcommovh.loteid          gcommovh_loteid,
                    gcommovh.refter      gcommovh_refter,      gcommovh.camope          gcommovh_camope,
                    gcommovh.in_count    gcommovh_in_count,    gcommovh.valpen          gcommovh_valpen,
                    gcommovh.loteid_mov  gcommovh_loteid_mov,  gcommovh.loteid_nfac     gcommovh_loteid_nfac,
                    gcommovh.loteid_prov gcommovh_loteid_prov, gcommovh.date_validate   gcommovh_date_validate,
                    gcommovh.date_print  gcommovh_date_print,  gcommovh.loteid_backprov gcommovh_loteid_backprov,
                    gcommovh.auxchr1     gcommovh_auxchr1,     gcommovh.auxchr2         gcommovh_auxchr2,
                    gcommovh.auxchr3     gcommovh_auxchr3,     gcommovh.auxchr4         gcommovh_auxchr4,
                    gcommovh.auxchr5     gcommovh_auxchr5,     gcommovh.auxnum1         gcommovh_auxnum1,
                    gcommovh.auxnum2     gcommovh_auxnum2,     gcommovh.auxnum3         gcommovh_auxnum3,
                    gcommovh.auxnum4     gcommovh_auxnum4,     gcommovh.auxnum5         gcommovh_auxnum5,

                    <!-- Lines columns -->
                    gcommovl.orden,       gcommovl.ctaori,     gcommovl.ctades,         gcommovl.codart,
                    gcommovl.desvar,      gcommovl.varlog,     gcommovl.numlot,         gcommovl.canmov,
                    gcommovl.canalt,      gcommovl.canrec,     gcommovl.altrec,         gcommovl.canabo,
                    gcommovl.canfac,      gcommovl.cananu,     gcommovl.canloc,         gcommovl.udmcom,
                    gcommovl.udmalt,      gcommovl.impcos,     gcommovl.cosmed,         gcommovl.terdep,
                    gcommovl.ubiori,      gcommovl.ubides,     gcommovl.canpre,         gcommovl.udmpre,
                    gcommovl.precio,      gcommovl.preiva,     gcommovl.pretar,         gcommovl.dtotar,
                    gcommovl.canbon,      gcommovl.tarid,      gcommovl.impnet,         gcommovl.terexp,
                    gcommovl.direxp,      gcommovl.desamp,     gcommovl.inctype,        gcommovl.docfoot,
                    gcommovl.indmod,      gcommovl.regalo,     gcommovl.tabori,         gcommovl.cabori,
                    gcommovl.valqty,      gcommovl.dtoli1,     gcommovl.dtoli2,         gcommovl.dtoli3,
                    gcommovl.dtoimp,      gcommovl.impdto,     gcommovl.impdte,         gcommovl.impdtc,
                    gcommovl.tax_basimp1, gcommovl.tax_oper1,  gcommovl.tax_code1,      gcommovl.tax_rule1,
                    gcommovl.tax_basimp2, gcommovl.tax_oper2,  gcommovl.tax_code2,      gcommovl.tax_rule2,
                    gcommovl.tax_basimp3, gcommovl.tax_oper3,  gcommovl.tax_code3,      gcommovl.tax_rule3,
                    gcommovl.tax_basimp4, gcommovl.tax_oper4,  gcommovl.tax_code4,      gcommovl.tax_rule4,
                    gcommovl.tax_porded,  gcommovl.tax_porpro, gcommovl.tax_cost,       gcommovl.linmov,
                    gcommovl.linrel,      gcommovl.linori,     gcommovl.linext,         gcommovl.linacu,
                    gcommovl.linreb,      gcommovl.linvreb,    gcommovl.lindtf,         gcommovl.lindtg,
                    gcommovl.auxchr1,     gcommovl.auxchr2,    gcommovl.auxchr3,        gcommovl.auxnum1,
                    gcommovl.auxnum2,     gcommovl.auxnum3,    gcommovl.batch_expdate,  gcommovl.batch_reference
                </columns>
                <from table='gcommovh'>
                    <join table='gcommovl'>
                        <on>gcommovh.cabid = gcommovl.cabid</on>
                    </join>
                    <join table='gcommovd'>
                        <on>gcommovh.tipdoc = gcommovd.codigo</on>
                    </join>
                </from>
                <where>
                        gcommovh.tipdoc = ?
                    AND <month>gcommovh.fecmov</month> = ?
                    AND <year>gcommovh.fecmov</year>   = ?
                    AND gcommovl.linreb = ?
                    AND gcommovd.natdoc = 'R'
                    AND NOT (gcommovl.canmov &lt;= 0)
                    AND NOT (gcommovl.canmov = 0 AND gcommovl.precio = 1 AND gcommovl.codart = ?)
                </where>
                <order>
                    1
                </order>
            </select>
        `,pObjGcom_rebcont.type_dlvpro, 
          mIntMonthCancel, 
          mIntYearCancel, 
          pObjGcom_rebcont.reb_seqno,
          pObjGcom_rebcont.type_item);

        mRsGcommovh.cursor()
            .group('cabid')
                .before(mRowGcommovh => {
                    let mObjGcommovh = {
                        cabid           : 0,
                        fcontm          : null,
                        fconta          : null,
                        movedi          : 0,
                        movest          : 0,
                        movhis          : 0,
                        estcab          : 'P',
                        estado          : 'N',
                        coment          : `CANCEL: [${mRowGcommovh.refter}] G: ${new Ax.sql.Date(mRowGcommovh.gcommovh_fecmov).format(DATE_FORMAT)}`,
                        fecmov          : pDateProcess,
                        fecpro          : pDateProcess,
                        fecrec          : pDateProcess,
                        feccon_nfac     : null,
                        
                        tipdoc          : mRowGcommovh.gcommovh_tipdoc,
                        depart          : mRowGcommovh.gcommovh_depart,
                        tercer          : mRowGcommovh.gcommovh_tercer,
                        cambio          : mRowGcommovh.gcommovh_cambio,
                        doclock         : mRowGcommovh.gcommovh_doclock,
                        tipefe          : mRowGcommovh.gcommovh_tipefe,
                        direnv          : mRowGcommovh.gcommovh_direnv,
                        terfac          : mRowGcommovh.gcommovh_terfac,
                        direxp          : mRowGcommovh.gcommovh_direxp,
                        muelle          : mRowGcommovh.gcommovh_muelle,
                        direcc          : mRowGcommovh.gcommovh_direcc,
                        poblac          : mRowGcommovh.gcommovh_poblac,
                        codpos          : mRowGcommovh.gcommovh_codpos,
                        codprv          : mRowGcommovh.gcommovh_codprv,
                        telef2          : mRowGcommovh.gcommovh_telef2,
                        fax             : mRowGcommovh.gcommovh_fax,
                        albh_gross      : mRowGcommovh.gcommovh_albh_gross,
                        zimemp          : mRowGcommovh.gcommovh_zimemp,
                        codpar          : mRowGcommovh.gcommovh_codpar,
                        numexp          : mRowGcommovh.gcommovh_numexp,
                        desadu          : mRowGcommovh.gcommovh_desadu,
                        destra          : mRowGcommovh.gcommovh_destra,
                        dtopp           : mRowGcommovh.gcommovh_dtopp,
                        porgar          : mRowGcommovh.gcommovh_porgar,
                        docdes          : mRowGcommovh.gcommovh_docdes,
                        empcode         : mRowGcommovh.gcommovh_empcode,
                        delega          : mRowGcommovh.gcommovh_delega,
                        almori          : mRowGcommovh.gcommovh_almori,
                        almdes          : mRowGcommovh.gcommovh_almdes,
                        tipdir          : mRowGcommovh.gcommovh_tipdir,
                        divisa          : mRowGcommovh.gcommovh_divisa,
                        docproc         : mRowGcommovh.gcommovh_docproc,
                        frmpag          : mRowGcommovh.gcommovh_frmpag,
                        terenv          : mRowGcommovh.gcommovh_terenv,
                        dirfac          : mRowGcommovh.gcommovh_dirfac,
                        terexp          : mRowGcommovh.gcommovh_terexp,
                        refter          : mRowGcommovh.gcommovh_refter,
                        nommos          : mRowGcommovh.gcommovh_nommos,
                        codnac          : mRowGcommovh.gcommovh_codnac,
                        nomnac          : mRowGcommovh.gcommovh_nomnac,
                        nomprv          : mRowGcommovh.gcommovh_nomprv,
                        telef1          : mRowGcommovh.gcommovh_telef1,
                        email           : mRowGcommovh.gcommovh_email,
                        oriaux          : mRowGcommovh.gcommovh_oriaux,
                        zimter          : mRowGcommovh.gcommovh_zimter,
                        codpre          : mRowGcommovh.gcommovh_codpre,
                        conten          : mRowGcommovh.gcommovh_conten,
                        dosier          : mRowGcommovh.gcommovh_dosier,
                        clasif          : mRowGcommovh.gcommovh_clasif,
                        dtogen          : mRowGcommovh.gcommovh_dtogen,
                        valor           : mRowGcommovh.gcommovh_valor,
                        portes          : mRowGcommovh.gcommovh_portes,
                        impant          : mRowGcommovh.gcommovh_impant,
                        loteid          : mRowGcommovh.gcommovh_loteid,
                        camope          : mRowGcommovh.gcommovh_camope,
                        valpen          : mRowGcommovh.gcommovh_valpen,
                        send_wms        : mRowGcommovh.gcommovh_send_wms,
                        indmod          : mRowGcommovh.gcommovh_indmod,
                        imptot          : mRowGcommovh.gcommovh_imptot,
                        impnxt          : mRowGcommovh.gcommovh_impnxt,
                        impaux          : mRowGcommovh.gcommovh_impaux,
                        refter          : mRowGcommovh.gcommovh_refter,
                        in_count        : mRowGcommovh.gcommovh_in_count,
                        auxchr1         : mRowGcommovh.gcommovh_auxchr1,
                        auxchr3         : mRowGcommovh.gcommovh_auxchr3,
                        auxchr5         : mRowGcommovh.gcommovh_auxchr5,
                        auxnum2         : mRowGcommovh.gcommovh_auxnum2,
                        auxnum4         : mRowGcommovh.gcommovh_auxnum4,
                        auxchr2         : mRowGcommovh.gcommovh_auxchr2,
                        auxchr4         : mRowGcommovh.gcommovh_auxchr4,
                        auxnum1         : mRowGcommovh.gcommovh_auxnum1,
                        auxnum3         : mRowGcommovh.gcommovh_auxnum3,
                        auxnum5         : mRowGcommovh.gcommovh_auxnum5,
                        post_hupd       : mRowGcommovh.gcommovh_post_hupd,
                        albaran_ser     : mRowGcommovh.gcommovh_albaran_ser,
                        impant_ntax     : mRowGcommovh.gcommovh_impant_ntax,
                        loteid_nfac     : mRowGcommovh.gcommovh_loteid_nfac,
                        date_validate   : mRowGcommovh.gcommovh_date_validate,
                        loteid_backprov : mRowGcommovh.gcommovh_loteid_backprov,
                        albaran_num     : mRowGcommovh.gcommovh_albaran_num,
                        loteid_mov      : mRowGcommovh.gcommovh_loteid_mov,
                        loteid_prov     : mRowGcommovh.gcommovh_loteid_prov,
                        date_print      : mRowGcommovh.gcommovh_date_print
                    }

                    mIntCabid = Ax.db.call("gcommovh_Insert", 'CANCEL RAPPELES', mObjGcommovh);
                })
                .after(mRowGcommovh => {
                    if (!mIntCabid) {
                        return;
                    }

                    Ax.db.call("gcommovh_Valida", mIntCabid);

                    Log.setLog(
                        {
                            log_fieldc_1 : mRowGcommovh.refter,
                            log_fieldn_1 : mIntCabid
                        }
                    );
                })
            .forEach(mRowGcommovl => {
                mRowGcommovl.cabid  = mIntCabid;

                mRowGcommovl.canmov = -mRowGcommovl.canmov;
                mRowGcommovl.canpre = -mRowGcommovl.canpre;

                if (mRowGcommovl.udmalt) {
                    mRowGcommovl.canalt = -mRowGcommovl.canalt;
                };

                Ax.db.insert("gcommovl", mRowGcommovl);
            });
    };

    /**
     *  LOCAL FUNCTION: __getSQLCondSource
     *  
     *  Build SQL condition of an rebate agremment source 
     * 
     *      PARAMETERS:
     *      ==============
     *      @param    {Integer}   pIntReb_seqno   Identifier rebate contract 
     * 
     *      @returns  {String}                   SQL condition 
     */
    function __getSQLCondSource(pIntReb_seqno) {
        let mStrSQLSource;
        let mStrSQLRowSource;

        let mArrSQLCondItems = [];
        let mArrSQLCondIncl  = [];
        let mArrSQLCondExcl  = [];

        let mRsSource = Ax.db.executeQuery(`
            <select>
                <columns>
                    gcom_rebcont_source.src_indexc         exclude,
                    gcom_rebcont_source.src_seqno,
                    gcom_rebcont_source.src_doctype_set    tipdoc,
                    gcom_rebcont_source.src_company_set    empcode,
                    gcom_rebcont_source.src_delega_set     delega,
                    gcom_rebcont_source.src_manufac_set    fabric,
                    gcom_rebcont_source.src_classitem_set  clasif, 
                    gcom_rebcont_source.src_family_set     codfam,
                    gcom_rebcont_source.src_brand_set      marca,
                    gcom_rebcont_source.src_model_set      modelo,
                    gcom_rebcont_source.src_famcom_set,
                    gcom_rebcont_source.src_qrycond        qrycond,

                    gcom_rebcont_items.item_code           codart,
                    gcom_rebcont_items.item_vl             varlog
                </columns>
                <from table='gcom_rebcont_source'> 
                    <join type='left' table='gcom_rebcont_items'>
                        <on>gcom_rebcont_source.src_seqno = gcom_rebcont_items.src_seqno</on>
                    </join>
                </from>
                <where>
                    gcom_rebcont_source.reb_seqno = ?
                </where>
                <order>1,2</order>
            </select>
        `, pIntReb_seqno);

        mRsSource.cursor()
        .group("src_seqno")
            .before(mRowSource => {
                let mObjQBERowSource = new Ax.sql.QBE(Ax.db);
                
                /**
                * Build SQL condition for not null fields
                */
                mRowSource.tipdoc  &&  mObjQBERowSource.addColumn(`gcommovh.tipdoc`, mRowSource.tipdoc)
                mRowSource.empcode &&  mObjQBERowSource.addColumn(`gcommovh.empcode`,mRowSource.empcode)
                mRowSource.delega  &&  mObjQBERowSource.addColumn(`gcommovh.delega`, mRowSource.delega)
                mRowSource.fabric  &&  mObjQBERowSource.addColumn(`garticul.fabric`, mRowSource.fabric)
                mRowSource.clasif  &&  mObjQBERowSource.addColumn(`garticul.clasif`, mRowSource.clasif)
                mRowSource.codfam  &&  mObjQBERowSource.addColumn(`garticul.codfam`, mRowSource.codfam)
                mRowSource.marca   &&  mObjQBERowSource.addColumn(`garticul.marca `, mRowSource.marca)
                mRowSource.modelo  &&  mObjQBERowSource.addColumn(`garticul.modelo`, mRowSource.modelo)

                mStrSQLSource = mObjQBERowSource.toString() || '1=1';

                if (mRowSource.qrycond) {
                    mStrSQLSource += `AND ${mRowSource.qrycond}`
                }
            })
            .after(mRowSource => {
                mStrSQLItems = mArrSQLCondItems.join(' OR ') || '1=1';

                mStrSQLRowSource = `${mStrSQLSource} AND (${mStrSQLItems})`

                mRowSource.exclude ? mArrSQLCondExcl.push(`(${mStrSQLRowSource})`) : mArrSQLCondIncl.push(`(${mStrSQLRowSource})`)
                mArrSQLCondItems = []
            })
        .forEach(mRowSource => {
            let mObjQBESourceItems = new Ax.sql.QBE(Ax.db)
            
            /**
             * Build SQL condition for not null fields
             */
            mRowSource.codart && mObjQBESourceItems.addColumn(`gcommovl.codart`, mRowSource.codart)
            mRowSource.varlog && mObjQBESourceItems.addColumn(`gcommovl.varlog`, mRowSource.varlog)

            mArrSQLCondItems.push(`(${mObjQBESourceItems.toString() || '1=1'})`);
        });

        /**
         * Build include and exclusion SQL conditions, each row merge with 
         * OR operator because its an union of multiple selects 
         */
        let mStrSQLSourceInc = mArrSQLCondIncl.join(' OR ') || '1=1';
        let mStrSQLSourceExc = mArrSQLCondExcl.join(' OR ') || '1=0';
        let mStrSQLCondSource = `( (${mStrSQLSourceInc})  AND NOT (${mStrSQLSourceExc}) )`;

        return mStrSQLCondSource
    }

    /**
     *  LOCAL FUNCTION: __getVolumePurchases
     *  
     *      Gets total gross,net and quantity amount of the volume purchases.
     *      Also, loads volume purchases of each supplier if there are more of 
     *      one settlement supplier
     * 
     *      PARAMETERS:
     *      ==============
     *      @param    {Object}     pObjGcom_rebcont  Rebate contract data
     *      @param    {Array}      pArrSubperiods    Purchase volume search subperiods
     *      @param    {String}     pStrSQLSource     SQL condition for the search of purchase orders
     *      @param    {Map}        pMapSuppliers     Data suppliers to liquidate
     * 
     *      @returns  {Object}                       Total volume purchases
     */
    function __getVolumePurchases(pObjGcom_rebcont, pArrSubperiods, pStrSQLSource, pMapSuppliers) {
        let mMapSuppliers = pMapSuppliers;

        /**
         * The object shall contain the total gross, net amount and the amount 
         */
        let mObjTotalVolume = {
            tot_gross_amount : 0,
            tot_net_amount   : 0,  
            tot_quantity     : 0   
        };

        pArrSubperiods.forEach(mRowSubperiod => {
            let mRsGcomalbh = Ax.db.executePreparedQuery(`
                <select>
                    <columns>
                        gcommovh.empcode, gcommovh.delega, gcommovh.tercer,

                        <sum>gart_uniconv_convert_qty(
                            0,
                            1,
                            gcommovl.codart,
                            gcommovl.varlog,
                            gcommovl.udmcom,
                            NULL,
                            garticul.udmbas,
                            CASE WHEN gcommovd.indrap = 'G'
                                 THEN -gcommovl.canmov 
                                 ELSE  gcommovl.canmov 
                             END,
                             NULL
                        )</sum> quantity,

                        <sum>icon_get_implocal(
                            gcommovh.divisa,
                            :{reb_currency},
                            gcommovh.fecmov,
                            NULL,
                            NULL,
                            CASE WHEN gcommovd.indrap = 'G'
                                 THEN -gcommovl.canpre * gcommovl.precio 
                                 ELSE  gcommovl.canpre * gcommovl.precio 
                             END,
                            NULL)</sum> gross_amount,

                        <sum>icon_get_implocal(
                            gcommovh.divisa,
                            :{reb_currency}, 
                            gcommovh.fecmov,
                            NULL,
                            NULL,
                            CASE WHEN gcommovd.indrap = 'G'
                                 THEN -<nvl>
                                          gcommovl_dtlh.cosrap * gcommovl.canpre ,
                                          gcommovl.impnet * (1 - gcommovh.dtogen/100) 
                                      </nvl>
                                 ELSE <nvl>
                                         gcommovl_dtlh.cosrap * gcommovl.canpre ,
                                         gcommovl.impnet * (1 - gcommovh.dtogen/100) 
                                     </nvl>
                             END,
                             NULL)</sum> net_amount
                    </columns>
                    <from table='gcommovh'>
                        <join table='gcommovd'>
                            <on>gcommovh.tipdoc = gcommovd.codigo</on>
                        </join>
                        <join table='gcommovl'>
                            <on>gcommovh.cabid  = gcommovl.cabid</on>
                        </join>
                        <join table='garticul'>
                            <on>gcommovl.codart = garticul.codigo</on>
                        </join>
                        <join type='left' table='gcommovl_dtlh'>
                            <on>gcommovl.linid = gcommovl_dtlh.linid</on>
                        </join>
                    </from>
                    <where>
                            gcommovh.fecmov BETWEEN :{fecini} AND :{fecfin}
                        AND gcommovh.tercer IN (SELECT supp_code
                                                  FROM gcom_rebcont_suppliers
                                                 WHERE reb_seqno = :{reb_seqno})
                        AND gcommovd.indrap  != 'N'
                        AND gcommovh.estcab   = 'V'
                        AND (gcommovd.natdoc != 'R' OR gcommovd.natdoc IS NULL)
                        AND ${pStrSQLSource}
                    </where>
                    <group>
                        1, 2, 3
                    </group>
                </select>
            `, 
            {
                "fecini"       : mRowSubperiod.fecini,
                "fecfin"       : mRowSubperiod.fecfin,
                "reb_seqno"    : pObjGcom_rebcont.reb_seqno,
                "reb_currency" : pObjGcom_rebcont.reb_currency,
                "type_dlvliq"  : pObjGcom_rebcont.type_dlvliq,
                "type_dlvpro"  : pObjGcom_rebcont.type_dlvpro
            });

            for (let mRowGcomalbh of mRsGcomalbh) {
                Ax.db.insert("gcom_rebcont_volper",
                    {
                        reb_seqno	     : pObjGcom_rebcont.reb_seqno,
                        per_empcode	     : mRowGcomalbh.empcode,
                        per_delega	     : mRowGcomalbh.delega,
                        per_supplier	 : mRowGcomalbh.tercer,
                        per_fecini	     : mRowSubperiod.fecini,
                        per_fecfin	     : mRowSubperiod.fecfin,
                        per_gross_amount : Ax.math.bc.mul(mRowGcomalbh.gross_amount, mRowSubperiod.factor),
                        per_net_amount	 : Ax.math.bc.mul(mRowGcomalbh.net_amount,   mRowSubperiod.factor),
                        per_qty          : Ax.math.bc.mul(mRowGcomalbh.quantity,     mRowSubperiod.factor)
                    }
                );

                mObjTotalVolume.tot_gross_amount = Ax.math.bc.add(
                    mObjTotalVolume.tot_gross_amount, 
                    Ax.math.bc.mul(mRowGcomalbh.gross_amount, mRowSubperiod.factor)
                );

                mObjTotalVolume.tot_net_amount = Ax.math.bc.add(
                    mObjTotalVolume.tot_net_amount,
                    Ax.math.bc.mul(mRowGcomalbh.net_amount, mRowSubperiod.factor)
                );

                mObjTotalVolume.tot_quantity = Ax.math.bc.add(
                    mObjTotalVolume.tot_quantity,
                    Ax.math.bc.mul(mRowGcomalbh.quantity, mRowSubperiod.factor)
                );

                /**
                 * The supplier, if any, to be settled is obtained.
                 */
                let mObjSupplier = mMapSuppliers.get(mRowGcomalbh.tercer);

                /**
                 * If the supplier to be liquidated exists and there is more 
                 * than one supplier to be liquidated.
                 */
                if (mMapSuppliers.size() > 1 && mObjSupplier) {
                    mObjSupplier.gross_amount = Ax.math.bc.add(mObjSupplier.gross_amount, mRowGcomalbh.gross_amount);
                    mObjSupplier.net_amount   = Ax.math.bc.add(mObjSupplier.net_amount,   mRowGcomalbh.net_amount);
                    mObjSupplier.quantity     = Ax.math.bc.add(mObjSupplier.quantity,     mRowGcomalbh.quantity);
                }
            }

            mRsGcomalbh.close();
        });

       return mObjTotalVolume
    }

    /**
     *  LOCAL FUNCTION: __calculateRebate
     * 
     *      Calculate rebate amount of the purchases volume and builds rebate
     *      data of each scales.
     *      
     *      There are 2 ways to calculate rebates
     *      All range : Total amount of purchases is evaluated in each tranche 
     *      until the total amount of purchases is less than the maximum limit 
     *      of a tranche.
     * 
     *      Reached range : A single tranche is sought whose range includes the 
     *      total amount of purchases. 
     * 
     *      PARAMETERS:
     *      ==============
     *      @param    {Integer}     pIntApplyScales   1: All range 0: Reached range
     *      @param    {Integer}     pIntReb_seqno     Identifier rebate contract
     *      @param    {Integer}     pIntBasComp       Type of comparation basis
     *      @param    {Object}      pObjTotalVolume   Total purchases volume
     *      @param    {BigDecimal}  pBcCompAmount     Amount of comparation basis
     * 
     *      @returns  {Object}                        Amount rebate info scales
     */
    function __calculateRebate(pIntApplyScales, pIntReb_seqno, pIntBasComp,
                               pObjTotalVolume, pBcCompAmount) {
        let mBcRebAmount   = 0;
        let mBcRebQuantity = 0;
        let mBcBascal      = 0;
        let mArrGcom_rebcont_settinfo = [];

        /**
         * Apply each scale
         */
        if (pIntApplyScales) {

            /**
             * Conversion factors to calculate value of a basis, in others basis
             */
            let mBcConversionToGross; 
            let mBcConversionToNet;
            let mBcConversionToQty;

            switch (pIntBasComp) {
                case GROSS_AMOUNT_BASE:
                    mBcConversionToGross = 1.0;
                    mBcConversionToNet   = Ax.math.bc.div(pObjTotalVolume.tot_net_amount, pObjTotalVolume.tot_gross_amount);
                    mBcConversionToQty   = Ax.math.bc.div(pObjTotalVolume.tot_quantity,   pObjTotalVolume.tot_gross_amount);
                    break;

                case NET_AMOUNT_BASE:
                    mBcConversionToGross = Ax.math.bc.div(pObjTotalVolume.tot_gross_amount, pObjTotalVolume.tot_net_amount);
                    mBcConversionToNet   = 1.0;
                    mBcConversionToQty   = Ax.math.bc.div(pObjTotalVolume.tot_quantity,     pObjTotalVolume.tot_net_amount);
                    break;

                case QUANTITY_BASE:
                    mBcConversionToGross = Ax.math.bc.div(pObjTotalVolume.tot_gross_amount, pObjTotalVolume.tot_quantity);
                    mBcConversionToNet   = Ax.math.bc.div(pObjTotalVolume.tot_net_amount,   pObjTotalVolume.tot_quantity);
                    mBcConversionToQty   = 1.0;
                    break;
            }

            let mBcFrom = 0;

            let mRsScales = Ax.db.executeQuery(`
                <select>
                    <columns>
                        reb_seqno,
                        sca_from,     sca_to,     sca_value,
                        sca_famreg,   sca_bascal, sca_formul,
                        sca_expected, sca_artreg, sca_varreg
                    </columns>
                    <from table='gcom_rebcont_scale'/>
                    <where>
                            reb_seqno   = ?
                        AND sca_from &lt; ?
                    </where>
                    <order>sca_from, sca_to</order>
                </select>
            `, pIntReb_seqno, pBcCompAmount);

            mRsScales.cursor()
            .beforeAll(mRowScale => {
                mBcFrom = mRowScale.sca_from;
            })
            .forEach(mRowScale => {
                mRowScale.sca_from = mBcFrom;
            
                /**
                 * If it is an intermediate leg and it is exceeded, the 
                 * intermediate leg will be ignored.
                 */
                if (mRowScale.sca_expected && 
                    Ax.math.bc.compareTo(pBcCompAmount, mRowScale.sca_to) > 0) {
                    return;

                } else {
                    
                    /**
                     * Determine whether the amount exceeds the bracket or not.
                     * If it exceeds the bracket, the range will be the range of the bracket.
                     * If not, subtract the amount minus the “from”.
                     */
                    let mBcRange = Ax.math.bc.compareTo(pBcCompAmount, mRowScale.sca_to) < 0
                        ? Ax.math.bc.sub(pBcCompAmount, mRowScale.sca_from)
                        : Ax.math.bc.sub(mRowScale.sca_to, mRowScale.sca_from) 

                    /**
                     * Choose calculation basis to calculate amounts and gift quantity
                     */
                    let mObjBascal = {
                        [GROSS_AMOUNT_BASE] : Ax.math.bc.mul(mBcConversionToGross, mBcRange),
                        [NET_AMOUNT_BASE]   : Ax.math.bc.mul(mBcConversionToNet,   mBcRange),
                        [QUANTITY_BASE]     : Ax.math.bc.mul(mBcConversionToQty,   mBcRange)
                    }
                
                    mBcBascal  = mObjBascal[mRowScale.sca_bascal];

                    /**
                     * Apply type of calculation
                     */
                    let mBcAmountRange;

                    switch (mRowScale.sca_formul) {
                        case PERCENTAGE:
                            mBcAmountRange = Ax.math.bc.mul(mBcBascal, Ax.math.bc.div(mRowScale.sca_value, 100));
                            break;
                        case UNIT_VALUE:
                            mBcAmountRange = Ax.math.bc.mul(mBcBascal, mRowScale.sca_value);
                            break;
                        case TOTAL_VALUE:
                            mBcAmountRange = mRowScale.sca_value;
                            break;
                    }

                    /**
                     * Save information settlement data 
                     */
                    mArrGcom_rebcont_settinfo.push(
                        {
                            liq_from	   : mRowScale.sca_from,
                            liq_to	       : mRowScale.sca_to,
                            liq_bascal	   : mRowScale.sca_bascal,
                            liq_formul	   : mRowScale.sca_formul,
                            liq_value	   : mRowScale.sca_value,
                            liq_reb_qty	   : mRowScale.sca_bascal == QUANTITY_BASE ? mBcAmountRange : null,
                            liq_reb_amount : mRowScale.sca_bascal == QUANTITY_BASE ? null : mBcAmountRange,
                            liq_artreg	   : mRowScale.sca_artreg,
                            liq_varreg     : mRowScale.sca_varreg
                        }
                    );

                    /**
                     * Accumulate total amount
                     */
                    mBcRebAmount = Ax.math.bc.add(mBcRebAmount, mBcAmountRange);
                    mBcFrom      = mRowScale.sca_to;
                }
            });

            mRsScales.close();
        } else {
            /**
             * Apply scale reached
             */
            let mObjScale = Ax.db.executeQuery(`
                <select>
                    <columns>
                        sca_from,   sca_to,     sca_value,
                        sca_famreg, sca_bascal, sca_formul,
                        sca_artreg, sca_varreg
                    </columns>
                    <from table='gcom_rebcont_scale'/>
                    <where>
                            reb_seqno    = ?
                        AND sca_to   &gt;= ?
                        AND sca_from &lt;  ?
                    </where>
                </select>
            `, pIntReb_seqno, pBcCompAmount, pBcCompAmount).toOne();

            /**
             * Choose calculation basis 
             */
            switch (mObjScale.sca_bascal) {
                case GROSS_AMOUNT_BASE:
                    mBcBascal = pObjTotalVolume.tot_gross_amount
                    break;
    
                case NET_AMOUNT_BASE:
                    mBcBascal = pObjTotalVolume.tot_net_amount
                    break;
    
                case QUANTITY_BASE:
                    mBcBascal = pObjTotalVolume.tot_quantity
                    break;
            }
    
            /**
             * Apply type of calculation
             */
            let mBcAmountRange;

            switch (mObjScale.sca_formul) {
                case PERCENTAGE:
                    mBcAmountRange = Ax.math.bc.mul(mBcBascal, Ax.math.bc.div(mObjScale.sca_value, 100));
                    break;
    
                case UNIT_VALUE:
                    mBcAmountRange = Ax.math.bc.mul(mBcBascal, mObjScale.sca_value);
                    break;
    
                case TOTAL_VALUE:
                    mBcAmountRange = mObjScale.sca_value;
                    break;
            }

            mBcRebAmount   = !(mObjScale.sca_bascal == QUANTITY_BASE) ? mBcAmountRange : null;
            mBcRebQuantity =  mObjScale.sca_bascal == QUANTITY_BASE ? mBcAmountRange : null;

            /**
             * Save information settlement data
             */
            mArrGcom_rebcont_settinfo.push(
                {
                    liq_from	   : mObjScale.sca_from,
                    liq_to	       : mObjScale.sca_to,
                    liq_bascal	   : mObjScale.sca_bascal,
                    liq_formul	   : mObjScale.sca_formul,
                    liq_value	   : mObjScale.sca_value,
                    liq_reb_qty	   : mBcRebQuantity,
                    liq_reb_amount : mBcRebAmount,
                    liq_artreg	   : mObjScale.sca_artreg,
                    liq_varreg     : mObjScale.sca_varreg
                }
            );
        }

        return {
            reb_amount   : mBcRebAmount ?? 0,
            arr_settinfo : mArrGcom_rebcont_settinfo
        }
    }

    /**
     *  LOCAL FUNCTION: __genSettlement
     * 
     *      Builds the data settlement to generate settlement or provision 
     *      delivery note
     * 
     *      PARAMETERS:
     *      ==============
     *      @param    {Integer}   pIntLiqseqno       Identifier settlement data
     *      @param    {Object}    pObjGcom_rebcont   Data rebate contract
     * 
     */
    function __genSettlement(pIntLiqseqno, pObjGcom_rebcont) {

        let mObjHeaderData = {}
        let mArrLinesData  = [];

        const BASECOMP_VALUES = new Map();

        BASECOMP_VALUES.set(GROSS_AMOUNT_BASE,'liq_per_gross_amount');
        BASECOMP_VALUES.set(NET_AMOUNT_BASE,  'liq_per_net_amount');
        BASECOMP_VALUES.set(QUANTITY_BASE,    'liq_per_qty');

        let mStrBasecomp = BASECOMP_VALUES.get(pObjGcom_rebcont.reb_bascom);

        let mRsSettleData = Ax.db.executeQuery(`
            <select>
                <columns>
                    <nvl>gcom_rebcont_suppdist.liq_supplier, gcom_rebcont_settle.liq_tercer</nvl> liq_supplier,
                    
                    gcom_rebcont_settle.liq_provis     is_provision,
                    gcom_rebcont_settle.liq_reb_amount total_rebate_amount,
                    gcom_rebcont_settle.liq_fecfin     fecini,
                    gcom_rebcont_settle.liq_fecfin     process_date,

                    gcom_rebcont_settinfo.liq_artreg,
                    gcom_rebcont_settinfo.liq_varreg,
                    gcom_rebcont_settinfo.liq_reb_qty,

                    <nvl>SUM(gcom_rebcont_suppdist.${mStrBasecomp}) OVER(PARTITION BY gcom_rebcont_suppdist.liq_supplier) / 
                         SUM(gcom_rebcont_suppdist.${mStrBasecomp}) OVER() , 1 </nvl>percentage
                </columns>
                <from table='gcom_rebcont_settle' >
                    <join type='left' table='gcom_rebcont_settinfo'>
                        <on>gcom_rebcont_settle.liq_seqno = gcom_rebcont_settinfo.liq_seqno</on>
                    </join>
                    <join type='left' table='gcom_rebcont_suppdist'>
                        <on>gcom_rebcont_settle.liq_seqno = gcom_rebcont_suppdist.liq_seqno</on>
                    </join>
                </from>
                <where>
                    gcom_rebcont_settle.liq_seqno = ?
                </where>
                <order>
                    1
                </order>
            </select>
        `, pIntLiqseqno);

        mRsSettleData.cursor()
        .group("liq_supplier")
            .before(mRowSettleData => {

                /**
                 * Distribuite rebate amount per supplier from total rebate amount
                 */
				if(Ax.math.bc.isZero(mRowSettleData.percentage)){
					return;
				}

				if ( !(mRowSettleData.liq_reb_qty 
                      && !Ax.math.bc.isZero(mRowSettleData.percentage))
                ) {
					let mBcRebateSupplier = Ax.math.bc.mul(mRowSettleData.total_rebate_amount, mRowSettleData.percentage)

                	mArrLinesData.push(
                	    {
                	        codart : pObjGcom_rebcont.type_item,
                	        varlog : '0',
                	        canmov : 1,
                	        precio : mBcRebateSupplier,
                	        linreb : pObjGcom_rebcont.reb_seqno
                	    }
                	)
                    
                }
                
				
            })
            .after(mRowSettleData => {

				if(Ax.math.bc.isZero(mRowSettleData.percentage)){
					return;
				}

                /**
                 * Generate settlement delivery note for each supplier
                 */
                mObjHeaderData = {
                    tipdir  : TIPDIR,
                    empcode : pObjGcom_rebcont.reb_empcode,
                    fecmov  : mRowSettleData.process_date,
                    tercer  : mRowSettleData.liq_supplier,
                    coment  : `PER: ${mRowSettleData.fecini} - ${mRowSettleData.process_date}`,
                    tipdoc  : mRowSettleData.is_provision ? pObjGcom_rebcont.type_dlvpro : pObjGcom_rebcont.type_dlvliq,
                    dtogen  : 0,
                    dtopp   : 0,
                    refter  : pObjGcom_rebcont.reb_docser
                };

                /**
                 * For suppliers with 0 volume purchases but they will be settlemented,
                 * dont register the settlement 
                 */
				__generateGcommovh(mObjHeaderData, mArrLinesData, pIntLiqseqno)
				
                

                mArrLinesData = [];
            })
        .forEach(mRowSettleData => {
            /**
             * Distribuite rebate quantity per supplier from each gifted article
             */
			if(Ax.math.bc.isZero(mRowSettleData.percentage)){
					return;
			}
            
            if(mRowSettleData.liq_artreg){
                let mBcRebateQtySupplier = Ax.math.bc.mul(mRowSettleData.liq_reb_qty, mRowSettleData.percentage)

                mArrLinesData.push(
                    {
                        codart : mRowSettleData.liq_artreg,
                        varlog : mRowSettleData.liq_varreg,
                        canmov : mBcRebateQtySupplier,
                        linreb : pObjGcom_rebcont.reb_seqno
                    }
                ) 
            }
        });
    }

    /**
     *  LOCAL FUNCTION: __generateGcommovh
     * 
     *      Generates settlement or provision delivery note with 
     *      settlement data, delivery note's identifier will 
     *      insert in process registers
     * 
     *      PARAMETERS:
     *      ==============
     *      @param    {Object}     pObjGcommovh   Header delivery note data
     *      @param    {Array}      pArrGcommovl   Line delivery note data
     *      @param    {Integer}    pIntLiqseqno   Identifier settlement data
     */
    function __generateGcommovh(pObjGcommovh, pArrGcommovl, pIntLiqseqno) {
        /**
         * Delivery Note Header
         */
        let mObjGcommovh   = pObjGcommovh;
        mObjGcommovh.cabid = Ax.db.call("gcommovh_Insert", 'RAPPELES', mObjGcommovh);

        /**
         * Delivery notes Lines
         */
        pArrGcommovl.forEach(mObjGcommovl => {
            /**
             * setting default values
             */
            mObjGcommovl.cabid  = mObjGcommovh.cabid,
            mObjGcommovl.numlot = '0';
            mObjGcommovl.terdep = '0';
            mObjGcommovl.ubiori = '0';
            mObjGcommovl.ubides = '0';
            mObjGcommovl.ubides = '0';
            mObjGcommovl.canrec =  0;
            mObjGcommovl.dtotar =  0;
            mObjGcommovl.impnet =  0;
            mObjGcommovl.indmod = 'S';
            mObjGcommovl.regalo = 'N';

            /**
             * Determinates all units 
             */
            let mObjUdmCom = Ax.db.executeProcedure('gart_unidefs_init_purchase',
                columnIndex => {
                    switch (columnIndex) {
                        case  1: return "udmcom";
                        case  2: return "udmalt";
                        case  3: return "udmrec";
                        case  4: return "udmpre";
                        default: return "undefined";
                    }
                },
                mObjGcommovl.codart,
                mObjGcommovl.varlog,
                mObjGcommovh.delega,
                mObjGcommovh.almori,
                mObjGcommovh.tercer,
                'gcommovh',
                mObjGcommovh.tipdoc,
                mObjGcommovh.fecmov
            ).toOne();

            mObjGcommovl.udmalt = mObjUdmCom.udmalt;
            mObjGcommovl.udmcom = mObjUdmCom.udmcom;
            mObjGcommovl.udmpre = mObjUdmCom.udmpre;

            if (!mObjGcommovl.udmalt && mObjGcommovl.udmcom == mObjGcommovl.udmpre) {
                mObjGcommovl.udmpre = mObjGcommovl.udmcom;
                mObjGcommovl.canpre = mObjGcommovl.canmov;
            } else {
                let mObjQtys = Ax.db.executeProcedure("gart_unidefs_getqtys",
                    columnIndex => {
                        switch  (columnIndex) {
                            case  1: return "canmov";
                            case  2: return "udmalt";
                            case  3: return "canalt";
                            case  4: return "canpre";
                            default: return "undefined";
                        }
                    },
                    0,
                    0,
                    mObjGcommovl.codart,
                    mObjGcommovl.varlog,
                    mObjGcommovl.udmcom,
                    mObjGcommovl.udmalt,
                    mObjGcommovl.udmpre,
                    mObjGcommovl.canmov,
                    null,
                    null
                ).toOne();

                mObjGcommovl.canmov = mObjQtys.canmov;
                mObjGcommovl.udmalt = mObjQtys.udmalt;
                mObjGcommovl.canalt = mObjQtys.canalt;
                mObjGcommovl.canpre = mObjQtys.canpre;
            };

            let mIntLinid = Ax.db.insert("gcommovl", mObjGcommovl).getSerial();

            /**
             * Conect lines delivery notes generated with the settlement
             */
            if (pIntLiqseqno) {
                Ax.db.insert("gcom_rebcont_link",
                    {
                        liq_seqno  : pIntLiqseqno,
                        liq_linalb : mIntLinid
                    }
                );  
            }
            
        });

        Ax.db.call("gcommovh_Valida", mObjGcommovh.cabid);

        Log.setLog(
            {
                log_fieldc_1 : mObjGcommovh.refter,
                log_fieldn_1 : mObjGcommovh.cabid
            }
        );
    }
    
    /*======================================================================

                                  BODY FUNCTION

    ========================================================================= */

    /**
     * Initialize the log.
     */
    const Iges = require("IgesLibrary");
    const Log  = new Iges.log(arguments.callee.name, 0, true);

    const DATE_FORMAT = Ax.ext.user.getDatePattern();

    /**
     * Values of periods settlement
     */
    const MONTHLY      = 0; 
    const QUARTERLY    = 1;
    const FOUR_MONTHLY = 2;
    const BIYEARLY     = 3;
    const YEARLY       = 4;

    /**
     * Values to set the quantity of months of each period
     */
    const PERIOD_VALUES = {
        [MONTHLY]      : 1,
        [QUARTERLY]    : 3,
        [FOUR_MONTHLY] : 4,
        [BIYEARLY]     : 6,
        [YEARLY]       : 12
    };

    /**
     * Values to represent calculation basis types
     */
    const GROSS_AMOUNT_BASE = 0;
    const NET_AMOUNT_BASE   = 1;
    const QUANTITY_BASE     = 2;
	
	/**
     * Values to set if its a process of settlement or provision
     */
    const SETTLEMENT = 1;
    const PROVISION  = 0;

    /**
     * Values of rebate calculation's formul
     */
    const PERCENTAGE  = 0;
    const UNIT_VALUE  = 1;
    const TOTAL_VALUE = 2;

    /**
     * Gets type of company address for the default address on the 
     * purchase documents
     */
    const TIPDIR = Ax.db.executeGet(`
        <select>
            <columns>dialco tipdir</columns>
            <from table='gdataemp'/>
        </select>
    `);

    let mDateProcess = new Ax.sql.Date(pDateProcess);
    let mStrSQLCond  = `gcom_rebcont.reb_tercer ${pStrSuppliers} AND ${pStrSQLCond}`;

    let mRsGcom_rebcont = Ax.db.executeQuery(`
        <select>
            <columns>
                gcom_rebcont.reb_seqno,         gcom_rebcont.reb_empcode,
                gcom_rebcont.reb_docser,        gcom_rebcont.reb_tercer,
                gcom_rebcont.reb_currency,      gcom_rebcont.reb_pernat,
                gcom_rebcont.reb_fecini,	    gcom_rebcont.reb_fecfin,
                gcom_rebcont.reb_bascom,        gcom_rebcont.reb_dst_liq,
                gcom_rebcont.reb_perliq,        gcom_rebcont.reb_type,
                gcom_rebcont.reb_lastliq,       gcom_rebcont.reb_allrange,
                gcom_rebcont.reb_calc_prov,

                gcom_rebcont_type.type_dlvpro,  gcom_rebcont_type.type_dlvliq,
                gcom_rebcont_type.type_item,    gcom_rebcont_type.type_tabaux,
                gcom_rebcont_type.type_colaux,  gcom_rebcont_type.type_filter_aux,

                gcommovd_pro.natdoc natdoc_prov, gcommovd_liq.natdoc natdoc_liq,

                EXISTS(SELECT gcom_rebcont_scale.sca_seqno
                         FROM gcom_rebcont_scale
                        WHERE gcom_rebcont_scale.reb_seqno = gcom_rebcont.reb_seqno) exists_scales
            </columns>
            <from table='gcom_rebcont'>
                <join table='gcom_rebcont_type'>
                    <on>gcom_rebcont_type.type_code = gcom_rebcont.reb_type</on>
                </join>
                <join type='left' table='gcommovd' alias='gcommovd_pro'>
                    <on>gcommovd_pro.codigo = gcom_rebcont_type.type_dlvpro</on>
                </join>
                <join type='left' table='gcommovd' alias='gcommovd_liq'>
                    <on>gcommovd_liq.codigo = gcom_rebcont_type.type_dlvliq</on>
                </join>
            </from>
            <where>
                    ? BETWEEN gcom_rebcont.reb_fecini AND gcom_rebcont.reb_fecfin
                AND gcom_rebcont.reb_status = 'A'
                AND ${mStrSQLCond}
            </where>
        </select>
    `, mDateProcess);

    mRsGcom_rebcont.forEach(mRowGcom_rebcont => {
        try {
            Ax.db.beginWork();

            /**
             * To make settlements or provisions, you have to make scales of 
             * discounts and quantity gift.
             */
            if (!mRowGcom_rebcont.exists_scales) {
                throw new Ax.ext.Exception("gcom_rebcont_Process_NOSCALES",
                    "Definir escalados en el contrato [${reb_docser}] para generar la liquidacion/provision",
                    {
                        reb_docser : mRowGcom_rebcont.reb_docser
                    }
                );
            }

            /**
             * There must be a provision calculation for settlement periods,
             * except monthly periods
             */
            if (!mRowGcom_rebcont.reb_calc_prov &&
                mRowGcom_rebcont.reb_perliq != MONTHLY) {
                throw new Ax.ext.Exception("gcom_rebcont_Process_CALCPROV",
                    "Definir calculo de provisión en el contrato [${reb_docser}] para generar provision",
                    {
                        reb_docser : mRowGcom_rebcont.reb_docser
                    }
                );
            }

            /**
             * The process can be execute, only for dates after last settlement/provision
             */
            if (mRowGcom_rebcont.reb_lastliq && 
                new Ax.sql.Date(mRowGcom_rebcont.reb_lastliq).days(mDateProcess) <= 0) {
                throw new Ax.ext.Exception("gcom_rebcont_Process_LIQDN",
                    "Ya se realizo una provision/liquidacion en [${reb_lastliq}] del contrato [${reb_docser}]",
                    {
                        reb_lastliq  : new Ax.sql.Date(mRowGcom_rebcont.reb_lastliq).format(DATE_FORMAT),
                        reb_docser       : mRowGcom_rebcont.reb_docser
                    }
                );
            }

            /**
             * Map of the remaining subperiods of the period to be processed
             */
            let mMapSubperiods = __getPendingSubperiods(
                new Ax.sql.Date(mRowGcom_rebcont.reb_fecini),
                new Ax.sql.Date(mRowGcom_rebcont.reb_lastliq ?? mRowGcom_rebcont.reb_fecini),
                mRowGcom_rebcont.reb_pernat,
                PERIOD_VALUES[mRowGcom_rebcont.reb_perliq]
            );

            /**
             * Process date has to matches with end of a subperiod
             */
            let mObjSubPeriod = mMapSubperiods.get(mDateProcess.format(DATE_FORMAT));

            if (!mObjSubPeriod) {
                throw new Ax.ext.Exception("gcom_rebcont_Process_NOTSUBPER",
                    "Contrato [${reb_docser}] : La fecha del proceso no es un provisional o liquidación.",
                    {
                        reb_docser : mRowGcom_rebcont.reb_docser
                    }
                );
            }

            /**
             * Process date must be the first subperiod
             */
            if (mObjSubPeriod.subperiod != 1) {
                throw new Ax.ext.Exception("gcom_rebcont_Process_PeriodDis",
                    "Contrato [${reb_docser}] : La fecha del proceso debe de ser continua al último proceso realizado.",
                    {
                        reb_docser : mRowGcom_rebcont.reb_docser
                    }
                );
            }

            __processGcom_rebcont(
                mRowGcom_rebcont,
                mObjSubPeriod.start_period,
                pDateProcess,
                mObjSubPeriod.settlement,
                mMapSubperiods
            );

            Ax.db.commitWork();
        } catch(error) {
            Ax.db.rollbackWork();

            /**
             * Write error log.
             */
            Log.setError({
                log_error    : error,
                log_message  : Ax.util.Error.getMessage(error),
                log_fieldc_1 : mRowGcom_rebcont.reb_docser
            })
        }
    });

    mRsGcom_rebcont.close();

    /**
     * Close of process log
     */
    Log.endLog();

    return Log.getLogId();
}